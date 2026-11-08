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

/** What kind of clips to look for. A ranking and a trailer are one clip made of several moments; the rest change only what the picker looks for. */
export const CLIP_TYPES = [
  { id: "best", label: "Best moments", hint: "The strongest parts of the video, each as its own clip." },
  { id: "ranking", label: "Ranking", hint: "The top moments counted down in one clip, with the list on screen." },
  { id: "trailer", label: "Trailer", hint: "The strongest lines from across the video joined into one short story." },
  { id: "answers", label: "Questions and answers", hint: "A question asked and answered. Good for interviews and podcasts." },
  { id: "takes", label: "Hot takes", hint: "Strong opinions and claims people will want to argue with." },
  { id: "stories", label: "Stories", hint: "A story told from its start to its payoff." },
  { id: "tips", label: "Tips", hint: "One useful thing to do, explained from start to finish." },
  { id: "funny", label: "Funny moments", hint: "Jokes and banter. SOCIA goes by what is said, so a laugh with no words can be missed." },
] as const;
export type ClipType = (typeof CLIP_TYPES)[number]["id"];
export const isClipType = (v: unknown): v is ClipType => CLIP_TYPES.some((t) => t.id === v);

/** The languages offered for a video. English first: auto-detect is thrown by mixed speech (an English talk with Arabic recitation came back as Urdu). */
export const CLIP_LANGUAGES: { id: string; label: string }[] = [
  { id: "en", label: "English" }, { id: "es", label: "Spanish" }, { id: "fr", label: "French" }, { id: "de", label: "German" },
  { id: "pt", label: "Portuguese" }, { id: "it", label: "Italian" }, { id: "ar", label: "Arabic" }, { id: "ur", label: "Urdu" },
  { id: "hi", label: "Hindi" }, { id: "tr", label: "Turkish" }, { id: "id", label: "Indonesian" }, { id: "auto", label: "Detect it" },
];

/** The language to ask transcription for; null lets it detect. Pure. */
export const transcriptionLanguage = (lang: string | null | undefined): string | null => (lang === "auto" ? null : lang || "en");

export type ClipperOptions = {
  /** Upper bound on clips (1 to 20). The provider may return fewer. */
  maxClips: number;
  lengths: ClipLength[];
  /** Burned-in captions. */
  captions: boolean;
  /** An AI headline (hook) on each clip. */
  headline: boolean;
  /** Spoken language, ISO code, or "auto" to detect it. */
  lang: string;
  clipModel: "clip_v1" | "clip_v2";
  /** What kind of clips to look for. Absent on jobs from before types: best moments. */
  clipType?: ClipType;
  /** The uploaded file's name, for the job list. */
  sourceName?: string;
};

export const DEFAULT_CLIPPER_OPTIONS: ClipperOptions = { maxClips: 5, lengths: ["under30", "30to60"], captions: true, headline: true, lang: "en", clipModel: "clip_v1", clipType: "best" };
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
