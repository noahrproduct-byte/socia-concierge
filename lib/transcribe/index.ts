// The one place Content Studio asks for speech-to-text. The provider is
// chosen by TRANSCRIPTION_PROVIDER (default assemblyai); a missing key means
// "no transcription" — the pipeline then says so, it never pretends.
import { assemblyAI } from "./assemblyai";
import type { Transcript, TranscriptionProvider } from "./types";

export type { Transcript, TranscriptWord, TranscriptionJob, TranscriptionPoll, TranscriptionProvider } from "./types";

const PROVIDERS: Record<string, TranscriptionProvider> = { assemblyai: assemblyAI };

export function getTranscriptionProvider(): TranscriptionProvider | null {
  const name = (process.env.TRANSCRIPTION_PROVIDER || "assemblyai").trim().toLowerCase();
  const p = PROVIDERS[name];
  return p && p.configured() ? p : null;
}

export const transcriptionConfigured = (): boolean => getTranscriptionProvider() != null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Submit and wait, polling with a gentle backoff, until the transcript is
 * ready or `deadlineAt` (epoch ms) passes. Returns null on timeout so the
 * caller can continue without a transcript and say so.
 */
export async function transcribeUrl(
  provider: TranscriptionProvider,
  audioUrl: string,
  deadlineAt: number,
  opts?: { language?: string | null },
): Promise<Transcript | null> {
  const job = await provider.submit(audioUrl, opts);
  let wait = 2000;
  while (Date.now() < deadlineAt) {
    await sleep(Math.min(wait, Math.max(250, deadlineAt - Date.now())));
    const r = await provider.poll(job);
    if (r.status === "done") return r.transcript;
    if (r.status === "error") throw new Error(r.error);
    wait = Math.min(6000, Math.round(wait * 1.4));
  }
  return null;
}
