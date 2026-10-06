// AssemblyAI (https://www.assemblyai.com/docs). Plain REST, no SDK: submit
// an audio URL, poll the transcript id. Word timestamps come back in
// milliseconds, which is what Content Studio stores.
import type { Transcript, TranscriptionJob, TranscriptionPoll, TranscriptionProvider, TranscriptWord } from "./types";

const BASE = process.env.ASSEMBLYAI_BASE_URL || "https://api.assemblyai.com/v2";

type AaiWord = { text: string; start: number; end: number; confidence?: number };
type AaiTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string | null;
  words?: AaiWord[] | null;
  language_code?: string | null;
  audio_duration?: number | null;
  error?: string | null;
};

const key = () => (process.env.ASSEMBLYAI_API_KEY ?? "").trim();

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: key(), "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? text.slice(0, 200) ?? `HTTP ${res.status}`;
    throw new Error(`AssemblyAI ${res.status}: ${msg}`);
  }
  return json as T;
}

export const assemblyAI: TranscriptionProvider = {
  name: "assemblyai",
  configured: () => Boolean(key()),

  async submit(audioUrl, opts) {
    const body: Record<string, unknown> = { audio_url: audioUrl, punctuate: true, format_text: true };
    if (opts?.language) body.language_code = opts.language;
    else body.language_detection = true;
    // Optional model pin (e.g. "universal"); the account default otherwise.
    if (process.env.ASSEMBLYAI_SPEECH_MODEL) body.speech_model = process.env.ASSEMBLYAI_SPEECH_MODEL;
    const r = await call<AaiTranscript>("/transcript", { method: "POST", body: JSON.stringify(body) });
    if (!r?.id) throw new Error("AssemblyAI returned no transcript id.");
    return { provider: "assemblyai", id: r.id };
  },

  async poll(job): Promise<TranscriptionPoll> {
    const r = await call<AaiTranscript>(`/transcript/${encodeURIComponent(job.id)}`, { method: "GET" });
    if (r.status === "queued" || r.status === "processing") return { status: r.status };
    if (r.status === "error") return { status: "error", error: r.error || "Transcription failed." };
    const words: TranscriptWord[] = (r.words ?? []).map((w) => ({
      text: w.text,
      startMs: Math.max(0, Math.round(w.start)),
      endMs: Math.max(0, Math.round(w.end)),
      confidence: typeof w.confidence === "number" ? w.confidence : null,
    }));
    const transcript: Transcript = {
      provider: "assemblyai",
      language: r.language_code ?? null,
      text: (r.text ?? "").trim(),
      words,
      durationMs: typeof r.audio_duration === "number" ? Math.round(r.audio_duration * 1000) : null,
      createdAt: new Date().toISOString(),
    };
    return { status: "done", transcript };
  },
};
