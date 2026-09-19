// Content Studio: "I have a piece of content, help me make it better before
// it goes live." Browser-safe types and helpers. The analysis is produced on
// the server (app/api/studio/analyze) from frames sampled in the browser,
// the transcript and caption the user supplies, and the account's own top
// posts. Nothing here predicts views or virality.

export type StudioKind = "video" | "image" | "carousel";

export type GoalId = "followers" | "engagement" | "awareness" | "local_orders" | "catering" | "authority";
export const GOALS: { id: GoalId; label: string; focus: string }[] = [
  { id: "followers", label: "Grow followers", focus: "a reason to follow, a repeatable format, and a clear identity in the first seconds" },
  { id: "engagement", label: "Drive engagement", focus: "questions, shareability and a comment prompt" },
  { id: "awareness", label: "Build awareness", focus: "a memorable subject, a broad hook and a strong first frame" },
  { id: "local_orders", label: "Drive local orders", focus: "product visibility, the place, an offer and a direct CTA" },
  { id: "catering", label: "Get catering bookings", focus: "scale (feeding groups), the booking path and a direct CTA" },
  { id: "authority", label: "Build creator authority", focus: "expertise on camera, a clear point of view and educational structure" },
];

export type CategoryId = "hook" | "pacing" | "clarity" | "visual" | "cta" | "audio";
export const CATEGORY_INFO: Record<CategoryId, { label: string; analyzes: string[]; video_only: boolean }> = {
  hook: { label: "Hook", video_only: false, analyzes: ["how quickly the main subject appears", "motion or change in the opening frames", "how much setup comes before value", "on-screen text and its legibility", "first-frame visual strength"] },
  pacing: { label: "Pacing", video_only: true, analyzes: ["how often the frame changes across the sampled moments", "static stretches without new information", "where the payoff lands relative to the length"] },
  clarity: { label: "Clarity", video_only: false, analyzes: ["whether the subject is obvious without sound", "text readability", "one idea per piece vs several competing ones", "transcript structure when one is provided"] },
  visual: { label: "Visual interest", video_only: false, analyzes: ["framing and lighting in the sampled frames", "variety of shots", "focus on the subject", "clutter"] },
  cta: { label: "CTA", video_only: false, analyzes: ["whether the ending or caption asks for a next action", "how specific that ask is", "fit with the chosen goal"] },
  audio: { label: "Audio fit", video_only: true, analyzes: ["only when a transcript or on-screen text is provided: whether the spoken line matches the visuals", "clarity of the message", "otherwise this category is marked not assessable, never guessed"] },
};

export type Category = { id: CategoryId; score: number | null; explanation: string; evidence: string; fix: string };
export type Marker = { t: number; kind: "issue" | "strong" | "pacing" | "cta" | "text"; label: string };
export type Segment = { start: number; end: number; label: string; rating: "weak" | "good" | "strong" | "needs"; reason: string };
export type ApplyField = "hook" | "cta" | "caption" | "onscreen";
export type TopFix = { title: string; observed: string; suggestion: string; kind: "opening" | "hook_text" | "ending" | "pacing" | "text" | "audio" | "visual" | "caption"; t: number | null; apply: { field: ApplyField; value: string } | null };
export type HookStyle = "curiosity" | "direct" | "local" | "educational" | "challenge" | "story";
export type HookOption = { style: HookStyle; text: string };
export type OnScreenText = { t: number; text: string; role: "opening" | "mid" | "cta" };
export type Cut = { type: "remove" | "trim"; start: number; end: number; reason: string };
export type AudioDirection = { style: string; bpm: string; texture: string; why: string };
export type PlatformFit = { platform: "Instagram Reels" | "TikTok" | "YouTube Shorts"; fit: "strong" | "medium" | "weak"; note: string };
export type CompareRow = { label: string; current: string; winners: string; verdict: "better" | "similar" | "worse" | "unknown" };

export type StudioAnalysis = {
  kind: StudioKind;
  durationSec: number | null;
  score: { overall: number; label: string };
  categories: Category[];
  observed: { subjectAppearsAt: number | null; faceSeen: boolean | null; onScreenText: boolean | null; ctaDetected: boolean | null; summary: string };
  markers: Marker[];
  segments: Segment[];
  topFixes: TopFix[];
  hooks: { current: string | null; options: HookOption[] };
  cta: { current: string | null; options: string[] };
  onScreenText: OnScreenText[];
  cuts: { currentSec: number; suggestedSec: number; edits: Cut[]; note: string } | null;
  audio: { observed: string; direction: AudioDirection; alternative: AudioDirection };
  platformFit: PlatformFit[];
  compare: { basis: string; rows: CompareRow[]; summary: string; sample: number } | null;
  niche: { basis: string; patterns: string[]; summary: string } | null;
  caption: { current: string | null; suggestion: string | null };
  meta: { frames: number; hadTranscript: boolean; analyzedAt: string; version: number };
};

export const SCORE_LABEL = (s: number) => (s >= 85 ? "Strong draft" : s >= 70 ? "Solid, with clear wins" : s >= 55 ? "Needs work before posting" : "Rework the opening first");

/** Structured-output schema for what the model produces. No nulls: sentinel
 *  values (-1, "", "none") are mapped on the server. */
const dir = { type: "object", additionalProperties: false, properties: { style: { type: "string" }, bpm: { type: "string" }, texture: { type: "string" }, why: { type: "string" } }, required: ["style", "bpm", "texture", "why"] } as const;
export const studioSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overall: { type: "integer" },
    categories: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string", enum: ["hook", "pacing", "clarity", "visual", "cta", "audio"] }, assessable: { type: "boolean" }, score: { type: "integer" }, explanation: { type: "string" }, evidence: { type: "string" }, fix: { type: "string" } }, required: ["id", "assessable", "score", "explanation", "evidence", "fix"] } },
    observed: { type: "object", additionalProperties: false, properties: { subjectAppearsAt: { type: "number" }, faceSeen: { type: "string", enum: ["yes", "no", "unknown"] }, onScreenText: { type: "string", enum: ["yes", "no", "unknown"] }, ctaDetected: { type: "string", enum: ["yes", "no", "unknown"] }, summary: { type: "string" } }, required: ["subjectAppearsAt", "faceSeen", "onScreenText", "ctaDetected", "summary"] },
    markers: { type: "array", items: { type: "object", additionalProperties: false, properties: { t: { type: "number" }, kind: { type: "string", enum: ["issue", "strong", "pacing", "cta", "text"] }, label: { type: "string" } }, required: ["t", "kind", "label"] } },
    segments: { type: "array", items: { type: "object", additionalProperties: false, properties: { start: { type: "number" }, end: { type: "number" }, label: { type: "string" }, rating: { type: "string", enum: ["weak", "good", "strong", "needs"] }, reason: { type: "string" } }, required: ["start", "end", "label", "rating", "reason"] } },
    topFixes: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, observed: { type: "string" }, suggestion: { type: "string" }, kind: { type: "string", enum: ["opening", "hook_text", "ending", "pacing", "text", "audio", "visual", "caption"] }, t: { type: "number" }, applyField: { type: "string", enum: ["hook", "cta", "caption", "onscreen", "none"] }, applyValue: { type: "string" } }, required: ["title", "observed", "suggestion", "kind", "t", "applyField", "applyValue"] } },
    currentHook: { type: "string" },
    hooks: { type: "array", items: { type: "object", additionalProperties: false, properties: { style: { type: "string", enum: ["curiosity", "direct", "local", "educational", "challenge", "story"] }, text: { type: "string" } }, required: ["style", "text"] } },
    currentCta: { type: "string" },
    ctaOptions: { type: "array", items: { type: "string" } },
    onScreenText: { type: "array", items: { type: "object", additionalProperties: false, properties: { t: { type: "number" }, text: { type: "string" }, role: { type: "string", enum: ["opening", "mid", "cta"] } }, required: ["t", "text", "role"] } },
    cuts: { type: "object", additionalProperties: false, properties: { suggestedSec: { type: "number" }, edits: { type: "array", items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["remove", "trim"] }, start: { type: "number" }, end: { type: "number" }, reason: { type: "string" } }, required: ["type", "start", "end", "reason"] } }, note: { type: "string" } }, required: ["suggestedSec", "edits", "note"] },
    audio: { type: "object", additionalProperties: false, properties: { observed: { type: "string" }, direction: dir, alternative: dir }, required: ["observed", "direction", "alternative"] },
    platformFit: { type: "array", items: { type: "object", additionalProperties: false, properties: { platform: { type: "string", enum: ["Instagram Reels", "TikTok", "YouTube Shorts"] }, fit: { type: "string", enum: ["strong", "medium", "weak"] }, note: { type: "string" } }, required: ["platform", "fit", "note"] } },
    compare: { type: "object", additionalProperties: false, properties: { rows: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: { type: "string" }, current: { type: "string" }, winners: { type: "string" }, verdict: { type: "string", enum: ["better", "similar", "worse", "unknown"] } }, required: ["label", "current", "winners", "verdict"] } }, summary: { type: "string" } }, required: ["rows", "summary"] },
    niche: { type: "object", additionalProperties: false, properties: { patterns: { type: "array", items: { type: "string" } }, summary: { type: "string" } }, required: ["patterns", "summary"] },
    captionSuggestion: { type: "string" },
  },
  required: ["overall", "categories", "observed", "markers", "segments", "topFixes", "currentHook", "hooks", "currentCta", "ctaOptions", "onScreenText", "cuts", "audio", "platformFit", "compare", "niche", "captionSuggestion"],
} as const;

export type ChecklistItem = { id: string; label: string; done: boolean; hint: string };

export function checklist(a: StudioAnalysis | null, w: { caption: string; platform: string | null; hook: string; cta: string; cover: boolean; audio: boolean }): ChecklistItem[] {
  const hookScore = a?.categories.find((c) => c.id === "hook")?.score ?? null;
  const early = a?.observed.subjectAppearsAt != null ? a.observed.subjectAppearsAt <= 1.5 : null;
  return [
    { id: "hook", label: "Hook is clear", done: Boolean(w.hook) || (hookScore != null && hookScore >= 70), hint: w.hook ? `Using: “${w.hook.slice(0, 50)}”` : hookScore != null ? `Hook scored ${hookScore}` : "Analyze first" },
    { id: "subject", label: "Main subject appears early", done: early === true, hint: a?.observed.subjectAppearsAt != null ? `First seen at ${a.observed.subjectAppearsAt.toFixed(1)}s` : "Not measured yet" },
    { id: "caption", label: "Caption ready", done: w.caption.trim().length >= 20, hint: w.caption.trim() ? `${w.caption.trim().length} characters` : "Write or pick one in Caption" },
    { id: "cta", label: "CTA included", done: Boolean(w.cta) || a?.observed.ctaDetected === true || /\?|order|book|dm|tag|comment|save|share|link/i.test(w.caption), hint: w.cta ? `Using: “${w.cta.slice(0, 50)}”` : "Pick one in Improve" },
    { id: "platform", label: "Platform selected", done: Boolean(w.platform), hint: w.platform ?? "Choose in Prepare" },
    { id: "cover", label: "Cover image chosen", done: w.cover, hint: w.cover ? "Frame chosen" : "Pick a frame from the strip" },
    { id: "audio", label: "Audio selected", done: w.audio, hint: w.audio ? "Marked as chosen" : "Tick when you've picked a track" },
  ];
}

/** One-paragraph summary of an analysis for Ask SOCIA's context. */
export function analysisSummary(a: StudioAnalysis): string {
  const cats = a.categories.map((c) => `${CATEGORY_INFO[c.id].label} ${c.score == null ? "not assessable" : c.score}`).join(", ");
  return [
    `Score ${a.score.overall}/100 (${a.score.label}). Categories: ${cats}.`,
    `Observed: ${a.observed.summary} Subject first appears at ${a.observed.subjectAppearsAt != null ? `${a.observed.subjectAppearsAt.toFixed(1)}s` : "unknown"}; face ${a.observed.faceSeen == null ? "unknown" : a.observed.faceSeen ? "seen" : "not seen"}; on-screen text ${a.observed.onScreenText == null ? "unknown" : a.observed.onScreenText ? "present" : "absent"}; CTA ${a.observed.ctaDetected == null ? "unknown" : a.observed.ctaDetected ? "detected" : "not detected"}.`,
    `Top fixes: ${a.topFixes.map((f, i) => `${i + 1}. ${f.title} (${f.observed})`).join(" ")}`,
    a.segments.length ? `Structure: ${a.segments.map((s) => `${fmtT(s.start)} to ${fmtT(s.end)} ${s.label} [${s.rating}]`).join("; ")}.` : "",
    a.compare ? `Compared with top posts (${a.compare.basis}): ${a.compare.summary}` : "",
  ].filter(Boolean).join("\n");
}

export const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtT1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export type VersionDelta = { label: string; delta: number }[];
export function versionDiff(prev: StudioAnalysis, cur: StudioAnalysis): VersionDelta {
  const out: VersionDelta = [];
  for (const c of cur.categories) {
    const p = prev.categories.find((x) => x.id === c.id);
    if (p?.score != null && c.score != null && p.score !== c.score) out.push({ label: CATEGORY_INFO[c.id].label, delta: c.score - p.score });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ------------------------------------------------------------ frames ----

export const FRAME_COUNT = 10;
export const FRAME_WIDTH = 480;
export const MAX_SECONDS = 180;
export const MAX_BYTES = 250 * 1024 * 1024;

export type Frames = { frames: string[]; times: number[]; duration: number; thumbs: { src: string; t: number }[] };

/** Sample frames from a video (a File or a same-site/CORS URL) with <video>
 *  + <canvas>. The file never leaves the browser; only small JPEG frames do. */
export async function extractFrames(source: File | string, onProgress: (done: number, total: number) => void, existing?: HTMLVideoElement | null): Promise<Frames> {
  // Prefer the visible player's own element: it is already decoding the
  // file, so no second decoder has to load (Chrome defers loading for
  // off-screen and background media). Otherwise a hidden in-document one.
  const own = !existing;
  const url = existing ? existing.currentSrc || existing.src : typeof source === "string" ? source : URL.createObjectURL(source);
  const video = existing ?? document.createElement("video");
  if (own) {
    if (typeof source === "string") video.crossOrigin = "anonymous";
    video.muted = true; video.playsInline = true; video.preload = "auto";
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    video.src = url;
    video.load();
  } else {
    video.pause();
  }
  const cleanup = () => {
    if (own) { video.pause(); video.removeAttribute("src"); video.load(); video.remove(); if (typeof source !== "string") URL.revokeObjectURL(url); }
    else { try { video.currentTime = 0; } catch { /* ignore */ } }
  };
  try {
    if (video.readyState < 1) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("unsupported")), 25000);
        const ok = () => { clearTimeout(t); video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", bad); resolve(); };
        const bad = () => { clearTimeout(t); video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", bad); reject(new Error("unsupported")); };
        video.addEventListener("loadedmetadata", ok);
        video.addEventListener("error", bad);
      });
    }
  } catch (e) { cleanup(); throw e; }
  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) { cleanup(); throw new Error("unsupported"); }
  if (duration > MAX_SECONDS) { cleanup(); throw new Error("too_long"); }
  if (duration < 1) { cleanup(); throw new Error("too_short"); }
  const canvas = document.createElement("canvas");
  const scale = FRAME_WIDTH / (video.videoWidth || FRAME_WIDTH);
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.max(1, Math.round((video.videoHeight || FRAME_WIDTH) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) { cleanup(); throw new Error("unsupported"); }
  // Front-load the samples: the first three seconds decide whether anyone stays.
  const early = [0, 0.7, 1.5, 2.5].filter((t) => t < duration);
  const rest: number[] = [];
  const remaining = FRAME_COUNT - early.length;
  for (let i = 1; i <= remaining; i++) { const t = 2.5 + (i / (remaining + 1)) * Math.max(0, duration - 2.5); if (t < duration) rest.push(Number(t.toFixed(2))); }
  const times = [...early, ...rest];
  const frames: string[] = [], thumbs: { src: string; t: number }[] = [];
  try {
    for (let i = 0; i < times.length; i++) {
      video.currentTime = Math.min(times[i], Math.max(0, duration - 0.05));
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => { video.removeEventListener("seeked", done); reject(new Error("unsupported")); }, 15000);
        const done = () => { clearTimeout(t); video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done);
      });
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch { throw new Error("cors"); }
      let data: string;
      try { data = canvas.toDataURL("image/jpeg", 0.6); } catch { throw new Error("cors"); }
      frames.push(data.split(",")[1]);
      thumbs.push({ src: data, t: times[i] });
      onProgress(i + 1, times.length);
    }
  } finally { cleanup(); }
  return { frames, times, duration, thumbs };
}

/** One JPEG frame per image (photo or carousel), resized like video frames. */
export async function imageFrames(sources: (File | string)[]): Promise<Frames> {
  const frames: string[] = [], thumbs: { src: string; t: number }[] = [];
  for (let i = 0; i < Math.min(10, sources.length); i++) {
    const src = sources[i];
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    if (typeof src === "string") img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(new Error("unsupported")), 20000); img.onload = () => { clearTimeout(t); resolve(); }; img.onerror = () => { clearTimeout(t); reject(new Error("unsupported")); }; img.src = url; });
    const canvas = document.createElement("canvas");
    const scale = FRAME_WIDTH / (img.naturalWidth || FRAME_WIDTH);
    canvas.width = FRAME_WIDTH; canvas.height = Math.max(1, Math.round((img.naturalHeight || FRAME_WIDTH) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("unsupported");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data: string;
    try { data = canvas.toDataURL("image/jpeg", 0.7); } catch { throw new Error("cors"); }
    frames.push(data.split(",")[1]); thumbs.push({ src: data, t: i });
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
  return { frames, times: thumbs.map((t) => t.t), duration: 0, thumbs };
}
