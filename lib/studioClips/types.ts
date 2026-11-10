// Build from Clips: the shapes shared by the browser (ingest, UI) and the
// server (analysis, routes). No SDK imports here — this file is bundled into
// client components.
import type { Transcript, TranscriptWord } from "@/lib/transcribe/types";

import type { EdlStyle, VideoPresets } from "./style";
import type { TextPresetId, TextSlot } from "@/lib/textPresets";
import type { Playlist, Soundtrack } from "@/lib/music/taste";

export type { Transcript, TranscriptWord };

export const STUDIO_BUCKET = "studio-sources";
/** Keyframe width sent to the model and shown as thumbnails. */
export const KEYFRAME_WIDTH = 480;
/** Width of the frames sampled for scene-change detection (never uploaded). */
export const SCAN_WIDTH = 160;
export const MIN_KEYFRAMES = 3;
export const MAX_KEYFRAMES = 24;
/** One frame this often, so SOCIA can see what really happens in a clip and when. */
export const KEYFRAME_STEP_SEC = 1.5;
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
  /** The sound of this action is part of the appeal: cutting, sizzling, pouring. */
  sound?: boolean;
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
  /** How closely it was looked at (lib/studioClips/teach.ts CARD_DETAIL); absent = the first, coarse cards. */
  detail?: number;
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
  /** Reframe (Editor V1): zoom 1..3 and where the frame sits in the footage, 0..1 each way (0.5 = centred). Absent = centred cover. */
  frame?: SegmentFrame;
  /** This clip's volume (Editor V2): 0 mutes it, 2 is twice as loud. Absent = as recorded. */
  volume?: number;
  /** How this cut comes in from the one before (ignored on the first): a hard cut, a fade, or a CapCut-style zoom or whip blur. Absent = a hard cut. */
  transition?: TransitionKind;
  /** The real sound of what's happening here plays up front, over the music (lib/studioClips/teach.ts). */
  sound?: boolean;
  /** What this shot does for the viewer in SOCIA's plan for the cut: the hook, context, development, the payoff or the close. */
  purpose?: SegmentPurpose;
  /** An L-cut: this shot's voice keeps playing this many seconds over the start of the next shot, so a sentence finishes without the picture running long (lib/studioClips/cutCheck.ts). */
  voiceTail?: number;
};

export const SEGMENT_PURPOSES = ["hook", "context", "development", "payoff", "close"] as const;
export type SegmentPurpose = (typeof SEGMENT_PURPOSES)[number];
export const isSegmentPurpose = (v: unknown): v is SegmentPurpose => SEGMENT_PURPOSES.includes(v as SegmentPurpose);

export const TRANSITIONS = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom blur" },
  { id: "whip", label: "Whip blur" },
] as const;
export type TransitionKind = (typeof TRANSITIONS)[number]["id"];
export const isTransition = (v: unknown): v is TransitionKind => TRANSITIONS.some((t) => t.id === v);

export type SegmentFrame = {
  zoom: number; x: number; y: number;
  /** The shot changes during the cut: what to show when, in seconds into the cut (lib/clipper/reframe.ts). Absent = it stays at x. */
  path?: { t: number; c: number; y: number; s: number }[];
};

/** The output sizes the editor offers (width × height at 1080 on the short side). */
export const ASPECTS = [
  { id: "9:16", label: "Vertical 9:16", width: 1080, height: 1920 },
  { id: "4:5", label: "Portrait 4:5", width: 1080, height: 1350 },
  { id: "1:1", label: "Square 1:1", width: 1080, height: 1080 },
  { id: "16:9", label: "Landscape 16:9", width: 1920, height: 1080 },
] as const;
export const aspectOf = (w: number, h: number) => ASPECTS.find((a) => a.width === w && a.height === h) ?? ASPECTS[0];

/**
 * One line of text on the video. The look comes from a locked preset
 * (lib/textPresets.ts): font, size range, colours, box and where it sits in
 * the safe zone; a person only writes the words, picks the preset, and may
 * move it between the zone's three slots. No position, scale or rotation is
 * stored. `at` is the line's start in output seconds.
 */
export type EdlText = {
  id: string;
  at: number;
  end: number;
  text: string;
  /** What the line is for (SOCIA's guide and learning read it); the look is the preset's. */
  role: "opening" | "mid" | "cta";
  /** The preset it renders with. Absent on cuts made before presets (Nov 2026): the role picks one (presetForRole). */
  presetId?: TextPresetId;
  /** Top, middle or bottom of the safe zone when the person moved it; absent = the preset's own slot. */
  slot?: TextSlot;
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
  /** Reduce background noise in the clips' sound (lib/studioClips/cleanSound.ts), done in the browser. On for cuts made since 2026-11-02; absent = off. */
  cleanSound?: boolean;
  /** Editor V2: font, brand accent, text background and caption style (lib/studioClips/style.ts). Absent = the original look. */
  style?: EdlStyle;
  /** A cut made from a written brief and/or a reference video (lib/studioClips/reference.ts): what it follows, so Regenerate follows it too. */
  brief?: EdlBrief;
  /** The ending in big type in the middle of the frame: the place, the ask, the website. */
  endCard?: EndCard;
  /** No one is talking and the action's own sound is the point: the clips' sound is lifted for it, not just cleaned. */
  actionSound?: boolean;
  /** Original tracks SOCIA made for this cut from the account's taste (lib/music/taste.ts). Server-owned. */
  playlist?: Playlist;
  /** The track mixed in, and the two levels the person chose. */
  soundtrack?: Soundtrack;
  /** When SOCIA tried adding music on its own (once per cut, whatever happened). Server-owned. */
  musicAuto?: string;
  /** When SOCIA coloured the cut on its own (lib/studioClips/autoLook.ts), once per cut whatever happened. */
  lookAuto?: string;
};

export type EndCard = { location: string; cta: string; site: string };

export type EdlBrief = { prompt: string | null; reference: string | null; referenceName: string | null };

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
  /** the viewer may edit and export (owner/admin, and the plan includes this kind of build) */
  canEdit: boolean;
  /** The person's own edit of their clips (Editor V1, every plan): no AI regenerate, no AI build counted. */
  manual: boolean;
  /** The brand's video style preset and saved templates (Editor V2). */
  presets?: VideoPresets;
  /** The viewer may change the brand's preset (owners and admins). */
  canManageBrand?: boolean;
  /** Tracks already made for this cut's playlist: signed URL by track id. */
  music?: Record<string, string>;
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
