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
import { fileSeconds, isReadableLink, youtubeSeconds, MAX_SOURCE_MINUTES } from "./sourceLength";
import { SOCIA_PROVIDER, checkTranscription, clipRows, pickMoments, sociaClipperReady, startTranscription } from "./socia";
import { clipWords, packWords, unpackWords } from "./pick";
import type { TranscriptWord } from "@/lib/transcribe/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type ClipJobRow = {
  id: string; user_id: string; workspace_id: string | null;
  source_kind: "youtube" | "upload" | "url"; source_url: string; source_path: string | null; source_minutes: number;
  options: ClipperOptions; provider: string; provider_job_id: string | null;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  credits_reserved: number; credits_charged: number | null; error: string | null;
  created_at: string; updated_at: string; last_polled_at: string | null; finished_at: string | null;
  /** SOCIA's own clipper: transcribing, picking, picking-run (claimed), pick-retry. Null for Vizard. */
  stage?: string | null;
};
export type ClipRow = {
  id: string; job_id: string; provider_clip_id: string | null; video_url: string | null; video_path: string | null; thumbnail_path: string | null;
  duration_ms: number | null; title: string | null; score: number | null; score_reason: string | null; transcript: string | null;
  caption: string | null; hashtags: string[]; created_at: string;
  /** SOCIA's own clips: where they sit in the source, the opening words, and the 9:16 crop (0 left, 1 right). */
  start_ms?: number | null; end_ms?: number | null; hook?: string | null; crop_x?: number | null;
};
/** What the browser needs to render one of SOCIA's own clips (components/ai/renderClip.ts). */
export type ClipRender = { sourceUrl: string; startMs: number; endMs: number; cropX: number; words: TranscriptWord[]; captions: boolean };
export type ClipView = ClipRow & { playUrl: string | null; downloadUrl: string | null; render?: ClipRender | null };

export const JOB_COLS = "id, user_id, workspace_id, source_kind, source_url, source_path, source_minutes, options, provider, provider_job_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at, stage";
const CLIP_COLS = "id, job_id, provider_clip_id, video_url, video_path, thumbnail_path, duration_ms, title, score, score_reason, transcript, caption, hashtags, created_at, start_ms, end_ms, hook, crop_x";

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

/**
 * The source's real length in whole minutes, measured by SOCIA: the price is
 * never taken from what the person typed. Throws ClipperError when it can't be
 * measured or is longer than MAX_SOURCE_MINUTES.
 */
export async function measureSourceMinutes(svc: Supa, source: CreateClipJobInput["source"], measure: Measure = defaultMeasure): Promise<number> {
  let seconds: number | null = null;
  if (source.kind === "youtube") seconds = await measure.youtube(source.url);
  else if (source.kind === "upload") {
    const url = await signedUrl(svc, source.path, 600);
    seconds = url ? await measure.file(url) : null;
  } else {
    if (!(await measure.readable(source.url))) throw new ClipperError("SOCIA can only read public https links to a video file. Upload the file instead.", "bad_link");
    seconds = await measure.file(source.url);
  }
  if (!seconds) {
    throw new ClipperError(
      source.kind === "youtube"
        ? "SOCIA couldn't read how long this YouTube video is. Check that it is public, or download it and upload the file."
        : "SOCIA couldn't read how long this video is. Save it as an .mp4 or .mov and upload it.",
      "no_length",
    );
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes > MAX_SOURCE_MINUTES) throw new ClipperError(`This video is ${minutes} minutes long. The Clipper takes videos up to ${MAX_SOURCE_MINUTES / 60} hours.`, "too_long");
  return minutes;
}

type Measure = { youtube: (url: string) => Promise<number | null>; file: (url: string) => Promise<number | null>; readable: (url: string) => Promise<boolean> };
const defaultMeasure: Measure = { youtube: youtubeSeconds, file: fileSeconds, readable: isReadableLink };

/** The page priced the job at fewer minutes than the video has: nothing is spent until the person sees the real price. */
export class PriceCheckError extends ClipperError {
  constructor(public minutes: number, public price: number) {
    super(`This video is ${minutes} ${minutes === 1 ? "minute" : "minutes"} long, so clipping it uses ${price.toLocaleString("en-US")} credits. Press Make clips again to go ahead.`, "confirm_price");
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
  /** The minutes the page showed a price for. The job is priced from the measured length; when that is longer, nothing is spent and PriceCheckError says the real price. */
  minutes: number | null;
  options: ClipperOptions;
};

/** Price, spend and save a job, then try to submit it at once. Throws ClipperError or CreditsError. */
export async function createClipJob(ctx: Ctx, input: CreateClipJobInput): Promise<ClipJobRow> {
  const svc = svcOrThrow();
  const provider = providerFor(input.source.kind);
  if (!provider) {
    throw new ClipperError(input.source.kind === "upload"
      ? "The clipper is not set up yet. Try again later."
      : "SOCIA clips uploaded files. Download the video and upload it here.", input.source.kind === "upload" ? "not_configured" : "upload_only");
  }
  const minutes = await measureSourceMinutes(svc, input.source);
  const credits = clipCredits(minutes, input.options.clipModel, provider);
  if (!input.minutes || input.minutes < minutes) throw new PriceCheckError(minutes, credits);
  const { data, error } = await svc.from("clip_jobs").insert({
    user_id: ctx.ownerId, workspace_id: ctx.workspace?.id ?? null,
    source_kind: input.source.kind, source_url: input.source.url, source_path: input.source.path ?? null,
    source_minutes: minutes, options: input.options, provider,
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

/**
 * Who clips a source: SOCIA's own clipper for uploads (it renders from the
 * file in the person's browser), Vizard for YouTube and direct links when its
 * key is set. Null when nobody can.
 */
export function providerFor(kind: CreateClipJobInput["source"]["kind"]): "socia" | "vizard" | null {
  if (kind === "upload" && sociaClipperReady()) return SOCIA_PROVIDER;
  return clipperProvider() ? "vizard" : null;
}

/** Hand a queued job to the provider if its rate limit allows; otherwise leave it queued for the poller. */
export async function submitClipJob(svc: Supa, job: ClipJobRow): Promise<ClipJobRow | null> {
  if (job.status !== "queued") return job;
  if (job.provider === SOCIA_PROVIDER) return submitSociaJob(svc, job);
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
  if (job.provider === SOCIA_PROVIDER) return pollSociaJob(svc, job);
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

// ---- SOCIA's own clipper (lib/clipper/socia.ts) ---------------------------

async function submitSociaJob(svc: Supa, job: ClipJobRow): Promise<ClipJobRow> {
  try {
    const transcriptId = await startTranscription(svc, job);
    const now = new Date().toISOString();
    const { data } = await svc.from("clip_jobs").update({ provider_job_id: transcriptId, status: "processing", stage: "transcribing", last_polled_at: now, updated_at: now }).eq("id", job.id).select(JOB_COLS).single();
    return (data as ClipJobRow) ?? { ...job, provider_job_id: transcriptId, status: "processing", stage: "transcribing" };
  } catch (e) {
    const err = e as ClipperError;
    if (err.retryable) return job;
    return fail(svc, job, err.message || "The video couldn't be sent for transcription.", true);
  }
}

/** A pick that died part-way may be claimed again after this long. */
const PICK_STALE_MS = 10 * 60_000;

async function pollSociaJob(svc: Supa, job: ClipJobRow): Promise<ClipJobRow> {
  const now = new Date();
  await svc.from("clip_jobs").update({ last_polled_at: now.toISOString() }).eq("id", job.id);
  if (job.stage === "transcribing") {
    let t;
    try {
      t = await checkTranscription(job.provider_job_id!);
    } catch {
      return job; // the transcription service didn't answer: ask again next poll
    }
    if (t.status === "processing") return job;
    if (t.status === "failed") return fail(svc, job, t.error, true);
    const { data } = await svc.from("clip_jobs").update({ transcript: packWords(t.words), stage: "picking", updated_at: new Date().toISOString() }).eq("id", job.id).eq("stage", "transcribing").select(JOB_COLS).single();
    if (!data) return job;
    job = data as ClipJobRow;
  }
  // One poller at a time picks (each pick is a paid AI call): claim the job first.
  const stale = new Date(now.getTime() - PICK_STALE_MS).toISOString();
  const claim = svc.from("clip_jobs").update({ stage: "picking-run", updated_at: new Date().toISOString() }).eq("id", job.id);
  const { data: claimed } = await (job.stage === "picking" ? claim.eq("stage", "picking") : claim.in("stage", ["picking-run", "pick-retry"]).lt("updated_at", stale)).select("transcript").maybeSingle();
  if (!claimed) return job;
  const words = unpackWords((claimed as { transcript: unknown }).transcript);
  try {
    const durationMs = words.length ? words[words.length - 1].endMs : job.source_minutes * 60_000;
    const { picks, brand } = await pickMoments(svc, job, words, durationMs);
    if (!picks.length) return fail(svc, job, "SOCIA found no moments in this video that stand on their own as clips. Your credits are back.", true);
    const rows = await clipRows(job, picks, brand);
    const { error } = await svc.from("clips").upsert(rows, { onConflict: "job_id,provider_clip_id" });
    if (error) throw new ClipperError(`clips not saved: ${error.message}`, "db", true);
    const done = new Date().toISOString();
    const { data } = await svc.from("clip_jobs").update({ status: "done", stage: null, credits_charged: job.credits_reserved, finished_at: done, updated_at: done, error: null }).eq("id", job.id).select(JOB_COLS).single();
    return (data as ClipJobRow) ?? { ...job, status: "done" };
  } catch (e) {
    console.error("[clipper] pick failed:", (e as Error)?.message ?? e);
    await svc.from("clip_jobs").update({ stage: "pick-retry", updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ...job, stage: "pick-retry" };
  }
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
export async function loadClips(client: Supa, ownerId: string, jobId: string, job?: ClipJobRow | null): Promise<ClipView[]> {
  const { data, error } = await client.from("clips").select(CLIP_COLS).eq("job_id", jobId).eq("user_id", ownerId).order("score", { ascending: false, nullsFirst: false }).order("created_at");
  if (error) throw new ClipperError(error.message, "db");
  const svc = createServiceClient();
  const rows = (data ?? []) as ClipRow[];
  // SOCIA's own clips render in the browser from the source: one signed source link and the job's words.
  let sourceUrl: string | null = null;
  let words: TranscriptWord[] = [];
  if (svc && job?.provider === SOCIA_PROVIDER && rows.some((r) => r.start_ms != null)) {
    sourceUrl = await signedUrl(svc, job.source_path, 6 * 3600);
    const { data: t } = await svc.from("clip_jobs").select("transcript").eq("id", job.id).eq("user_id", ownerId).maybeSingle();
    words = unpackWords((t as { transcript?: unknown } | null)?.transcript);
  }
  const out: ClipView[] = [];
  for (const r of rows) {
    const playUrl = svc ? await signedUrl(svc, r.video_path) : null;
    const downloadUrl = svc ? await signedUrl(svc, r.video_path, undefined, `${(r.title ?? "clip").replace(/[^\w-]+/g, "_").slice(0, 60)}.mp4`) : null;
    const render: ClipRender | null = sourceUrl && r.start_ms != null && r.end_ms != null
      ? { sourceUrl, startMs: r.start_ms, endMs: r.end_ms, cropX: Number(r.crop_x ?? 0.5), words: clipWords(words, r.start_ms, r.end_ms), captions: job?.options?.captions !== false }
      : null;
    out.push({ ...r, playUrl: playUrl ?? r.video_url, downloadUrl: downloadUrl ?? r.video_url, render });
  }
  return out;
}

/** Everything a signed-in owner's library shows: finished clips across jobs. */
export async function listClipsForLibrary(client: Supa, ownerId: string, wsId: string | null, limit = 60): Promise<ClipView[]> {
  // Only clips that exist as a file (SOCIA's own clips once rendered).
  let q = client.from("clips").select(CLIP_COLS).eq("user_id", ownerId).not("video_path", "is", null).order("created_at", { ascending: false }).limit(limit);
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
