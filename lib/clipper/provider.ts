// The clipping provider behind the AI Clipper. The UI and the job routes only
// know this interface, so Vizard (lib/clipper/vizard.ts) can be swapped for
// Opus Clip or a self-built pipeline (transcribe, pick highlights, crop)
// without touching them. Client-safe types; the providers are server only.

/** Target length of each clip, in the provider-neutral words the UI uses. */
export type ClipLength = "auto" | "under30" | "30to60" | "60to90" | "90to180";
export const CLIP_LENGTHS: { id: ClipLength; label: string }[] = [
  { id: "auto", label: "Let the provider decide" },
  { id: "under30", label: "Under 30 s" },
  { id: "30to60", label: "30 to 60 s" },
  { id: "60to90", label: "60 to 90 s" },
  { id: "90to180", label: "90 s to 3 min" },
];
export const isClipLength = (v: unknown): v is ClipLength => CLIP_LENGTHS.some((l) => l.id === v);

export type ClipperOptions = {
  /** Upper bound on clips (1 to 20). The provider may return fewer. */
  maxClips: number;
  lengths: ClipLength[];
  /** Burned-in captions. */
  captions: boolean;
  /** An AI headline (hook) on each clip. */
  headline: boolean;
  /** Spoken language, ISO code. */
  lang: string;
  clipModel: "clip_v1" | "clip_v2";
};

export const DEFAULT_CLIPPER_OPTIONS: ClipperOptions = { maxClips: 5, lengths: ["under30", "30to60"], captions: true, headline: true, lang: "en", clipModel: "clip_v1" };
export const MAX_CLIPS = 20;

export type ClipperSource =
  | { kind: "youtube"; url: string }
  | { kind: "url"; url: string; ext: string }
  /** A file SOCIA holds; `url` is a signed URL the provider can download for a while. */
  | { kind: "upload"; url: string; ext: string };

export type ProviderClip = {
  id: string;
  /** The provider's download URL; temporary. */
  videoUrl: string;
  durationMs: number | null;
  title: string | null;
  /** 0 to 10 when the provider scores clips; null when it does not. */
  score: number | null;
  scoreReason: string | null;
  transcript: string | null;
  relatedTopics: string[];
};

export type ClipperStatus =
  | { status: "processing" }
  | { status: "done"; clips: ProviderClip[] }
  | { status: "failed"; error: string; code?: string };

export interface ClipperProvider {
  readonly name: string;
  submitJob(source: ClipperSource, options: ClipperOptions): Promise<{ providerJobId: string }>;
  getJobStatus(providerJobId: string): Promise<ClipperStatus>;
  getClips(providerJobId: string): Promise<ProviderClip[]>;
}

export class ClipperError extends Error {
  constructor(message: string, public code: string = "provider_error", public retryable = false) {
    super(message);
  }
}
