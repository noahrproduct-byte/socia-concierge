// SOCIA's own clipper, the server half (lib/clipper/server.ts drives it):
//   1. transcribe the uploaded video (lib/transcribe, AssemblyAI, real word times)
//   2. pick the moments with Claude, from a brief built of the brand, Noah's
//      examples (docs/clipper/examples.json), this brand's posted-clip results
//      (./learn.ts) and the niche's leading hooks and topics (stored reads only)
//   3. save each moment as a clip: its range in the source, a title, a hook, a
//      score and reason, and a caption. The person's browser renders it
//      (components/ai/renderClip.ts) with the crop they choose.
// Server only.
import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage, recordTranscription } from "@/lib/aiUsage";
import { getTranscriptionProvider } from "@/lib/transcribe";
import { getProfile } from "@/lib/profile";
import { competitorScopeId } from "@/lib/workspaces";
import { loadCachedNicheRead } from "@/lib/trendSignalsLoad";
import { trendsEvidence } from "@/lib/trendSignals";
import { brandLine, writeClipCaptions } from "@/lib/aiStudio/captions";
import { signedUrl } from "@/lib/aiStudio/media";
import { ClipperError, transcriptionLanguage, type ClipperOptions } from "./provider";
import { clipExamples } from "./examples";
import { clipResultLines, loadClipOutcomes } from "./learn";
import { PICK_SCHEMA, PICK_SYSTEM, RANKING_SCHEMA, RANKING_SYSTEM, TRAILER_SYSTEM, checkPicks, pickMessage, transcriptLines, type ClipPick } from "./pick";
import { MIN_RANKED, rankingMs, rankingOf, trailerOf } from "./ranking";
import type { TranscriptWord } from "@/lib/transcribe/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const SOCIA_PROVIDER = "socia";

/** SOCIA's clipper can run: a transcription provider and the AI key are set. */
export function sociaClipperReady(): boolean {
  return Boolean(getTranscriptionProvider()) && Boolean(process.env.ANTHROPIC_API_KEY);
}

type JobLike = { id: string; user_id: string; workspace_id: string | null; source_path: string | null; source_minutes: number; options: ClipperOptions; provider_job_id: string | null };

/** Send the source to transcription. Returns the transcription's id. */
export async function startTranscription(svc: Supa, job: JobLike): Promise<string> {
  const provider = getTranscriptionProvider();
  if (!provider) throw new ClipperError("Transcription is not set up, so SOCIA can't clip right now.", "not_configured", false);
  const url = await signedUrl(svc, job.source_path, 24 * 3600);
  if (!url) throw new ClipperError("The uploaded file could not be read.", "no_source", false);
  const t = await provider.submit(url, { language: transcriptionLanguage(job.options.lang), speakers: true });
  recordTranscription(job.user_id, "clipper", job.source_minutes * 60);
  return t.id;
}

/** `billed`: the transcription finished (and was paid for) even though the job can't go on. */
export type TranscriptionState = { status: "processing" } | { status: "done"; words: TranscriptWord[]; durationMs: number } | { status: "failed"; error: string; billed?: boolean };

export async function checkTranscription(transcriptId: string): Promise<TranscriptionState> {
  const provider = getTranscriptionProvider();
  if (!provider) return { status: "processing" };
  const r = await provider.poll({ provider: provider.name, id: transcriptId });
  if (r.status === "error") return { status: "failed", error: "The video's speech couldn't be transcribed. Check that it has clear speech, then try again." };
  if (r.status !== "done") return { status: "processing" };
  const words = r.transcript.words ?? [];
  if (words.length < 20) return { status: "failed", error: "SOCIA heard too little speech in this video to find clips in it.", billed: true };
  return { status: "done", words, durationMs: r.transcript.durationMs ?? words[words.length - 1].endMs };
}

/** The moments worth clipping, from the transcript and everything SOCIA has learned for this brand. */
export async function pickMoments(svc: Supa, job: JobLike, words: TranscriptWord[], durationMs: number): Promise<{ picks: ClipPick[]; brand: string; rankingTitle: string | null }> {
  const [profile, outcomes, niche] = await Promise.all([
    getProfile(svc, job.user_id, job.workspace_id ? ({ id: job.workspace_id } as never) : null).catch(() => null),
    loadClipOutcomes(svc, job.user_id, job.workspace_id),
    competitorScopeId(svc, job.workspace_id).then((scope) => loadCachedNicheRead(svc, job.user_id, scope)).catch(() => null),
  ]);
  const brand = brandLine(profile);
  const message = pickMessage({
    brand, durationMs, lines: transcriptLines(words),
    options: { maxClips: job.options.maxClips, lengths: job.options.lengths, clipType: job.options.clipType },
    examples: clipExamples(), results: clipResultLines(outcomes), niche: trendsEvidence(niche?.signals ?? null) || null,
  });
  const type = job.options.clipType;
  const joined = type === "ranking" || type === "trailer";
  const model = modelFor("clipper_pick");
  const params = {
    model, max_tokens: 6000, system: type === "trailer" ? TRAILER_SYSTEM : type === "ranking" ? RANKING_SYSTEM : PICK_SYSTEM,
    output_config: { format: { type: "json_schema", schema: joined ? RANKING_SCHEMA : PICK_SCHEMA }, ...effortFor(model) },
    messages: [{ role: "user", content: message }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(job.user_id, "clipper_pick", res);
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  if (!raw) {
    console.error(`[clipper] pick: unreadable answer, stop ${res.stop_reason}, ${text.length} chars`);
    throw new ClipperError("SOCIA couldn't read its own pick of the moments. Try again.", "pick_failed", true);
  }
  const { picks, ...counts } = checkPicks(raw, words, job.options);
  // Counts only, never the words: why a job did or didn't get clips.
  console.log("[clipper] pick", JSON.stringify({ job: job.id, words: words.length, kept: picks.length, ...counts, stop: res.stop_reason, outputTokens: res.usage?.output_tokens }));
  // Clips came back and none survived: that is SOCIA's fault, not the video's, so it isn't reported as "no moments".
  if (counts.returned > 0 && !picks.length) throw new ClipperError("None of the picked moments passed SOCIA's checks.", "pick_rejected", true);
  if (joined) {
    const title = (raw as { title?: unknown }).title;
    return { picks: picks.length >= MIN_RANKED ? picks : [], brand, rankingTitle: typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 90) : "" };
  }
  return { picks, brand, rankingTitle: null };
}

/** Rows for the clips table, captions written in the brand's voice. */
export async function clipRows(job: JobLike, picks: ClipPick[], brand: string, rankingTitle: string | null = null) {
  if (rankingTitle != null) return rankingRows(job, picks, brand, rankingTitle);
  const captions = await writeClipCaptions(job.user_id, brand, picks.map((p) => ({ title: p.title, transcript: p.text })));
  return picks.map((p, i) => ({
    job_id: job.id, user_id: job.user_id, workspace_id: job.workspace_id, provider_clip_id: `socia-${i + 1}`,
    video_url: null, video_path: null, start_ms: p.startMs, end_ms: p.endMs, duration_ms: p.endMs - p.startMs,
    title: p.title, hook: p.hook || null, score: p.score, score_reason: p.reason, transcript: p.text,
    caption: captions[i]?.caption ?? p.title, hashtags: captions[i]?.hashtags ?? [], crop_x: 0.5, emphasis: p.emphasis ?? [],
  }));
}

/** A ranking is one row: its range is the first moment played, and `ranking` holds them all. */
async function rankingRows(job: JobLike, picks: ClipPick[], brand: string, title: string) {
  const ranking = job.options.clipType === "trailer" ? trailerOf(title, picks) : rankingOf(title, picks);
  const first = ranking.items[0];
  const inPlayOrder = job.options.clipType === "trailer" ? picks : [...picks].reverse();
  const transcript = inPlayOrder.map((p) => p.text).join(" ");
  const [caption] = await writeClipCaptions(job.user_id, brand, [{ title: ranking.title, transcript }]);
  const score = Math.round((picks.reduce((sum, p) => sum + p.score, 0) / picks.length) * 10) / 10;
  return [{
    job_id: job.id, user_id: job.user_id, workspace_id: job.workspace_id, provider_clip_id: "socia-ranking",
    video_url: null, video_path: null, start_ms: first.startMs, end_ms: first.endMs, duration_ms: rankingMs(ranking),
    title: ranking.title, hook: null, score, score_reason: picks.map((p, i) => `${i + 1}. ${p.title}: ${p.reason}`).join(" "), transcript,
    caption: caption?.caption ?? ranking.title, hashtags: caption?.hashtags ?? [], crop_x: 0.5, ranking, emphasis: Array.from(new Set(picks.flatMap((p) => p.emphasis ?? []))),
  }];
}
