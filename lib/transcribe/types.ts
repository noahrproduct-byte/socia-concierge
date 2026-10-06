// Speech-to-text, provider-agnostic. Content Studio only ever sees these
// shapes; swapping AssemblyAI for another provider means one new file under
// lib/transcribe and one environment variable (TRANSCRIPTION_PROVIDER).

export type TranscriptWord = {
  text: string;
  startMs: number;
  endMs: number;
  /** 0..1 from the provider, or null when it reports none. */
  confidence: number | null;
};

export type Transcript = {
  provider: string;
  /** BCP-47-ish code the provider detected, or null. */
  language: string | null;
  text: string;
  words: TranscriptWord[];
  durationMs: number | null;
  createdAt: string;
};

export type TranscriptionJob = { provider: string; id: string };

export type TranscriptionPoll =
  | { status: "queued" | "processing" }
  | { status: "done"; transcript: Transcript }
  | { status: "error"; error: string };

export interface TranscriptionProvider {
  readonly name: string;
  /** True when the credentials this provider needs are present. */
  configured(): boolean;
  /** Start transcribing the audio at a fetchable (signed, short-lived) URL. */
  submit(audioUrl: string, opts?: { language?: string | null }): Promise<TranscriptionJob>;
  /** One status check; callers decide how often to poll. */
  poll(job: TranscriptionJob): Promise<TranscriptionPoll>;
}
