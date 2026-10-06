// "Understand this footage": the job behind Build from Clips. Transcribes
// what has speech, builds a card per clip (cached by fingerprint across
// projects), reasons over the batch, validates the Content Yield, and writes
// honest progress the page polls. Runs inside the request's after() budget.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranscriptionProvider, type TranscriptionJob, type TranscriptionProvider } from "@/lib/transcribe";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { signUrls } from "./storage";
import { clipCard, batchGroups, AnalysisError, type AccountContext } from "./analysis";
import { validateYield, type ClipForYield } from "./yield";
import { clipRows, frameUrls, toClipInputs, updateProject, type ClipRow } from "./server";
import type { UnderstandProgress, UnderstandStage, YieldResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const CARD_CONCURRENCY = 4;
const STT_POLL_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type UnderstandResult = { ok: true; yield: YieldResult } | { ok: false; error: string };

export async function runUnderstand(client: Supa, args: { projectId: string; acct: AccountContext; deadlineAt: number }): Promise<UnderstandResult> {
  const { projectId, acct, deadlineAt } = args;
  const startedAt = new Date().toISOString();
  let progress: UnderstandProgress = { stage: "understanding", done: 0, total: 0, startedAt, updatedAt: startedAt };
  const setProgress = async (patch: Partial<UnderstandProgress>) => {
    progress = { ...progress, ...patch, updatedAt: new Date().toISOString() };
    await updateProject(client, projectId, { status: "understanding", progress }).catch(() => null);
  };
  const fail = async (error: string): Promise<UnderstandResult> => {
    await updateProject(client, projectId, { status: "failed", progress: null, error }).catch(() => null);
    return { ok: false, error };
  };

  try {
    const rows = (await clipRows(client, projectId)).filter((r) => r.status === "uploaded" || r.status === "ready");
    if (!rows.length) return fail("No uploaded clips to understand.");
    await setProgress({ total: rows.length, done: rows.filter((r) => r.card).length });

    // 1) Transcription for clips with audio and no transcript yet.
    const provider = getTranscriptionProvider();
    const needStt = rows.filter((r) => !r.transcript && r.audio_path && r.facts?.audio?.hasAudio !== false && r.facts?.audio?.level !== "silent");
    if (!provider) {
      if (needStt.length) await setProgress({ noTranscription: true });
    } else if (needStt.length) {
      await transcribeClips(client, provider, needStt, Math.min(deadlineAt - 110_000, Date.now() + 150_000), (n, stage) => setProgress({ transcribing: n, stage }));
    }

    // 2) One card per clip that lacks one (reused clips already have theirs).
    await setProgress({ stage: "understanding", transcribing: 0 });
    const fresh = await clipRows(client, projectId);
    const todo = fresh.filter((r) => !r.card && (r.status === "uploaded" || r.status === "ready"));
    const urls = await frameUrls(client, todo);
    const inputs = toClipInputs(todo, urls);
    let failures = 0;
    await pool(inputs, CARD_CONCURRENCY, async (input) => {
      if (Date.now() > deadlineAt - 45_000) { failures++; return; }
      try {
        const card = await clipCard(input, acct);
        await client.from("studio_clips").update({ card, status: "ready", error: null, updated_at: new Date().toISOString() }).eq("id", input.id);
      } catch (e) {
        failures++;
        const msg = e instanceof AnalysisError ? e.message : (e as Error)?.message ?? "analysis failed";
        console.error(`[studio] card failed for clip ${input.id}:`, msg);
        await client.from("studio_clips").update({ error: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", input.id).then(() => null, () => null);
      }
      progress.done++;
      await setProgress({});
    });

    // 3) The batch, then arithmetic over the proposals.
    const ready = (await clipRows(client, projectId)).filter((r) => r.card);
    if (!ready.length) return fail(failures ? "SOCIA couldn't understand any of these clips. Try again, or re-export the files as H.264 MP4." : "No clip could be understood.");
    await setProgress({ stage: "grouping" });
    const batchUrls = await frameUrls(client, ready);
    const batch = await batchGroups(toClipInputs(ready, batchUrls), acct);

    await setProgress({ stage: "building" });
    const forYield: ClipForYield[] = ready.map((r) => ({ id: r.id, position: r.position, durationSec: r.duration_s ?? 0, card: r.card }));
    const validated = validateYield(batch.groups, forYield);
    const result: YieldResult = { ...validated, summary: batch.summary, model: batch.model };
    await updateProject(client, projectId, {
      status: "ready", progress: null, error: null, yield: result,
      batch: { summary: batch.summary, unusable: batch.unusable, model: batch.model, cardFailures: failures, transcriptionAvailable: Boolean(provider) },
    });
    return { ok: true, yield: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[studio] understand failed:", msg);
    // The same words the rest of SOCIA uses for an AI outage (lib/aiStatus.ts);
    // the page adds that nothing was counted against the plan.
    const kind = aiFailureKind(e);
    return fail(kind === "failed" ? "Understanding failed. Try again in a moment." : AI_UNAVAILABLE_COPY[kind]);
  }
}

/** Submit every clip's audio, poll together, store transcripts as they land. */
async function transcribeClips(client: Supa, provider: TranscriptionProvider, rows: ClipRow[], deadlineAt: number, onProgress: (pending: number, stage: UnderstandStage) => Promise<void>): Promise<void> {
  const urls = await signUrls(client, rows.map((r) => r.audio_path!));
  const jobs = new Map<string, TranscriptionJob>();
  for (const r of rows) {
    const url = urls[r.audio_path!];
    if (!url) continue;
    try { jobs.set(r.id, await provider.submit(url)); }
    catch (e) { console.error(`[studio] transcription submit failed for ${r.id}:`, (e as Error)?.message ?? e); }
  }
  await onProgress(jobs.size, "transcribing");
  while (jobs.size && Date.now() < deadlineAt) {
    await sleep(STT_POLL_MS);
    for (const [clipId, job] of Array.from(jobs)) {
      try {
        const r = await provider.poll(job);
        if (r.status === "done") {
          await client.from("studio_clips").update({ transcript: r.transcript, updated_at: new Date().toISOString() }).eq("id", clipId);
          jobs.delete(clipId);
        } else if (r.status === "error") {
          console.error(`[studio] transcription failed for ${clipId}:`, r.error);
          jobs.delete(clipId);
        }
      } catch (e) {
        console.error(`[studio] transcription poll failed for ${clipId}:`, (e as Error)?.message ?? e);
        jobs.delete(clipId);
      }
    }
    await onProgress(jobs.size, "transcribing");
  }
  if (jobs.size) console.error(`[studio] ${jobs.size} transcription(s) did not finish before the deadline; continuing without them`);
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await run(item); }
  });
  await Promise.all(workers);
}
