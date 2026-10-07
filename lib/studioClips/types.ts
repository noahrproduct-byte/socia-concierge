// Build from Clips: the shapes shared by the browser (ingest, UI) and the
// server (analysis, routes). No SDK imports here — this file is bundled into
// client components.
import type { Transcript, TranscriptWord } from "@/lib/transcribe/types";

export type { Transcript, TranscriptWord };

export const STUDIO_BUCKET = "studio-sources";
/** Keyframe width sent to the model and shown as thumbnails. */
export const KEYFRAME_WIDTH = 480;
/** Width of the frames sampled for scene-change detection (never uploaded). */
export const SCAN_WIDTH = 160;
export const MIN_KEYFRAMES = 3;
export const MAX_KEYFRAMES = 8;
/** Transcription audio: 16 kHz mono 16-bit WAV. */
export const WAV_SAMPLE_RATE = 16000;
/** Shortest and longest clip Build from Clips accepts, in seconds. */
export const MIN_CLIP_SEC = 1;
export const MAX_CLIP_SEC = 10 * 60;

export type ProjectStatus = "collecting" | "understanding" | "ready" | "failed";
export type ClipStatus = "registered" | "uploaded" | "ready" | "failed" | "expired";

/** Per-sampled-frame measurements (0..1 scales). */
export type FrameFacts = {
  t: number;
  /** mean luminance */
  luma: number;
  /** luminance standard deviation */
  contrast: number;
  /** share of near-white pixels (blown highlights) */
  clipHi: number;
  /** share of near-black pixels (crushed shadows) */
  clipLo: number;
  /** (mean red − mean blue) / 255: negative = cool, positive = warm */
  warmth: number;
};

export type VisualFacts = {
  sampled: FrameFacts[];
  /** timestamps where the picture changes sharply; null when scanning was not possible */
  sceneCuts: number[] | null;
  medianLuma: number;
  brightness: "dark" | "ok" | "bright";
  contrast: "low" | "ok" | "high";
  warmth: "cool" | "neutral" | "warm";
  clippedHighlights: boolean;
  crushedShadows: boolean;
};

export type AudioFacts = {
  hasAudio: boolean;
  /** RMS level in dBFS over the whole clip, null without audio */
  rmsDb: number | null;
  peakDb: number | null;
  /** share of 100 ms windows above the audible threshold */
  audibleRatio: number | null;
  /** stretches below the silence threshold for at least SILENCE_MIN_SEC */
  silences: { start: number; end: number }[];
  level: "silent" | "quiet" | "ok" | "loud" | "unknown";
};

export type ClipFacts = {
  /** how the file was read; "video-element" means a <video> fallback with no scene scan */
  method: "mediabunny" | "video-element";
  visual: VisualFacts | null;
  audio: AudioFacts | null;
};

export type ClipMoment = {
  start: number;
  end: number;
  label: string;
  strength: "strong" | "good" | "weak";
  why: string;
};

/** Pass 1: what SOCIA understood about one clip. Cached by fingerprint. */
export type ClipCard = {
  subject: string;
  setting: string;
  action: string;
  people: "none" | "one" | "several" | "unknown";
  moments: ClipMoment[];
  speech: { present: boolean; summary: string; hookLine: string | null };
  quality: {
    visual: "ok" | "dark" | "bright" | "low_contrast" | "mixed" | "unknown";
    audio: "ok" | "quiet" | "loud" | "noisy" | "silent" | "unknown";
    notes: string[];
  };
  tags: string[];
  /** true when the clip has a moment that could open a post (first seconds grab attention or a spoken hook) */
  openerCandidate: boolean;
  model: string;
  createdAt: string;
};

export type StudioClip = {
  id: string;
  projectId: string;
  position: number;
  name: string;
  mime: string | null;
  bytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  recordedAt: string | null;
  status: ClipStatus;
  error: string | null;
  facts: ClipFacts | null;
  transcript: Transcript | null;
  card: ClipCard | null;
  /** signed keyframe URLs (short-lived) in time order; empty once footage expired */
  frames: { t: number; url: string }[];
  expiresAt: string | null;
  /** analysis was copied from an identical clip uploaded earlier */
  reused: boolean;
};

export type MomentRef = { clipId: string; start: number; end: number };

export type OpportunityEvidence = {
  clips: number;
  usableSec: number;
  distinctMoments: number;
  hasOpener: boolean;
  hasSpeech: boolean;
};

export type Opportunity = {
  idx: number;
  title: string;
  /** one sentence: what the post is and why this footage supports it */
  angle: string;
  clipIds: string[];
  moments: MomentRef[];
  opener: (MomentRef & { why: string }) | null;
  cta: string | null;
  evidence: OpportunityEvidence;
  strength: "strong" | "possible";
};

export type RejectedIdea = { title: string; reason: string };

export type YieldResult = {
  opportunities: Opportunity[];
  rejected: RejectedIdea[];
  clipsAnalyzed: number;
  footageSec: number;
  /** one or two sentences about the batch as a whole */
  summary: string;
  createdAt: string;
  model: string;
};

export type UnderstandStage = "transcribing" | "understanding" | "grouping" | "building";
export type UnderstandProgress = {
  stage: UnderstandStage;
  done: number;
  total: number;
  startedAt: string;
  updatedAt: string;
  /** clips whose audio is at the transcription provider right now */
  transcribing?: number;
  /** true when no transcription provider is configured: cards are built from frames and measured audio only */
  noTranscription?: boolean;
};

export type StudioProject = {
  id: string;
  title: string | null;
  status: ProjectStatus;
  progress: UnderstandProgress | null;
  yield: YieldResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  clips: StudioClip[];
  /** opportunity indices that already have a build (guide) */
  builds: number[];
};

// ------------------------------------------------------------------ EDL ----

export type EdlSegment = {
  id: string;
  clipId: string;
  in: number;
  out: number;
  role: "opener" | "body" | "ending";
  note: string;
};

export type EdlText = {
  id: string;
  at: number;
  end: number;
  text: string;
  role: "opening" | "mid" | "cta";
};

export type EdlEnhance = {
  clipId: string;
  kind: "brighten" | "darken" | "warm" | "cool" | "contrast";
  amount: "slight" | "moderate";
  why: string;
};

export type EdlAudio = {
  clipId: string;
  /** measured balance toward the loudest-median clip; ± dB */
  gainDb: number;
  why: string;
};

/**
 * The non-destructive edit model. Phase A renders it as an edit guide; Phase
 * B renders it in the Player and to a file. Times are clip-relative seconds
 * for segments and output-relative seconds for text.
 */
export type Edl = {
  version: 1;
  fps: 30;
  width: number;
  height: number;
  targetSec: { min: number; max: number };
  segments: EdlSegment[];
  text: EdlText[];
  /** captions come from the real transcript or not at all */
  captions: { source: "transcript" } | null;
  enhance: EdlEnhance[];
  audio: EdlAudio[];
  cta: string | null;
  /** recommendation only — SOCIA never adds music */
  music: string | null;
  caption: string;
  notes: string[];
  /** Phase C: measured picture and sound corrections (absent until measured). */
  finish?: EdlFinish;
};

/**
 * The colorCorrection() parameters SOCIA chose for one clip (same names and
 * scales as @remotion/effects), always inside the gentle limits in
 * lib/studioClips/grade.ts. Neutral = { 0, 1, 0, 0, 0, 0, 1, 0 }.
 */
export type GradeParams = {
  exposure: number;
  contrast: number;
  shadows: number;
  highlights: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
};

/** Measured look of a clip's frames, 0..1 scales (sRGB). */
export type LookStats = {
  /** median luminance */
  luma: number;
  /** luminance standard deviation */
  contrast: number;
  /** share of near-white / near-black pixels */
  clipHi: number;
  clipLo: number;
  /** mean red − mean blue */
  warmth: number;
  /** mean green − mean of red and blue (positive = green cast) */
  tint: number;
  /** mean HSL saturation */
  saturation: number;
};

export type ClipGrade = { params: GradeParams; before: LookStats; after: LookStats; reasons: string[] };

export type SoundStats = {
  /** mean level of the speech/sound, dBFS */
  levelDb: number | null;
  /** highest sample peak, dBFS */
  peakDb: number | null;
  /** level between sounds (10th percentile), dBFS */
  noiseDb: number | null;
};

export type ClipSound = {
  /** typical gain applied, dB */
  gainDb: number;
  /** gain over clip time: db[i] applies at t0 + i·step seconds */
  curve: { t0: number; step: number; db: number[] };
  before: SoundStats;
  after: SoundStats;
  reasons: string[];
};

export type EdlFinish = {
  look: "off" | "enhance" | "match";
  /** per clip, for the selected look; empty when look is off */
  grades: Record<string, ClipGrade>;
  /** audio cleanup on/off */
  sound: boolean;
  sounds: Record<string, ClipSound>;
  /** long pauses SOCIA cut out of this edit (the segments already reflect it) */
  pausesCut: { count: number; seconds: number } | null;
  measuredAt: string;
};

export type GuideStep = {
  n: number;
  text: string;
  clipId?: string;
  /** clip-relative range this step refers to */
  range?: [number, number];
  kind: "cut" | "text" | "enhance" | "audio" | "captions" | "music" | "length" | "ending";
};

export type StudioBuild = {
  id: string;
  projectId: string;
  opportunityIdx: number;
  edl: Edl;
  guide: GuideStep[];
  caption: string | null;
  createdAt: string;
  /** output length implied by the EDL */
  durationSec: number;
  /** footage this build refers to has expired */
  footageExpired: boolean;
  /** Phase B: how many times this build was regenerated with a directive */
  regenerations: number;
  /** earlier EDL versions kept for undo */
  historyLength: number;
  /** rendered file in scheduled-media, once exported */
  renderPath: string | null;
  renderedAt: string | null;
  /** the draft post the render was saved to */
  postId: string | null;
};

// -------------------------------------------------------- Make This Video ----

export type RegenerateDirective = "faster" | "energetic" | "professional" | "shorter" | "different_hook" | "different_clips";

export const REGENERATE_OPTIONS: { id: RegenerateDirective; label: string; hint: string }[] = [
  { id: "faster", label: "Faster paced", hint: "More, shorter cuts" },
  { id: "energetic", label: "More energetic", hint: "Punchier opener and text" },
  { id: "professional", label: "More professional", hint: "Calmer, fewer lines" },
  { id: "shorter", label: "Shorter", hint: "Keep only the strongest moments" },
  { id: "different_hook", label: "Different hook", hint: "Another opening moment and line" },
  { id: "different_clips", label: "Use different clips", hint: "Other footage where it exists" },
];

/** Regenerations allowed per build (server-enforced). */
export const MAX_REGENERATIONS = 8;

/** One clip as the Player and renderer need it. */
export type BuildSource = {
  clipId: string;
  position: number;
  name: string;
  /** signed URL of the raw clip (short-lived) */
  url: string;
  /** signed URL of the first keyframe, for lists */
  thumb: string | null;
  durationSec: number;
  width: number | null;
  height: number | null;
  words: TranscriptWord[] | null;
  /** usable moments from the clip card, for "replace clip" */
  moments: ClipMoment[];
};

export type BuildPlayerData = {
  build: StudioBuild;
  sources: BuildSource[];
  /** the viewer may edit, regenerate and export (owner/admin, plan includes auto_build) */
  canEdit: boolean;
};

/** Output canvas for every build (vertical, Reels/TikTok/Shorts). */
export const OUTPUT = { width: 1080, height: 1920, fps: 30 } as const;

/** Human label for a clip: its upload position, never the raw filename alone. */
export const clipLabel = (position: number): string => `Clip ${position + 1}`;

export const fmtClock = (s: number): string => {
  const whole = Math.max(0, Math.floor(s));
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
