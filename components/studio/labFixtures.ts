// Fixtures for the Studio lab (components/studio/StudioLab.tsx): one project
// of three clips, its Content Yield, SOCIA's cut of the first post, and a
// Rate analysis, all built from the sample video in public/ (frames are
// sampled in the browser and passed in). Development only; illustrative
// numbers, never measured. Nothing here reaches production.
import { CAPCUT_STYLE } from "@/lib/studioClips/style";
import { guideFromEdl, type ClipForEdl } from "@/lib/studioClips/edl";
import type { BuildPlayerData, BuildSource, ClipCard, ClipFacts, Edl, StudioBuild, StudioClip, StudioProject, YieldResult } from "@/lib/studioClips/types";
import type { ProjectSummary } from "@/lib/studioClips/server";
import type { VideoSummary } from "@/lib/studioClips/videos";
import type { LibraryClip } from "@/lib/studioClips/library";
import type { StudioAnalysis } from "@/lib/studio";
import type { TranscriptWord } from "@/lib/transcribe/types";

export const SAMPLE_URL = "/dev-sample.mp4";
export const PROJECT_ID = "fx";
export const BUILD_ID = "fx-build-0";
export const MANUAL_BUILD_ID = "fx-build-manual";

export type Thumb = { src: string; t: number };

const NOW = "2026-11-03T10:00:00.000Z";
const r2 = (n: number) => Math.round(n * 100) / 100;

const words = (lines: [string, number][]): TranscriptWord[] => {
  const out: TranscriptWord[] = [];
  for (const [text, at] of lines) {
    let t = at;
    for (const w of text.split(" ")) {
      const len = 180 + w.length * 45;
      out.push({ text: w, startMs: Math.round(t), endMs: Math.round(t + len), confidence: 0.96 });
      t += len + 70;
    }
  }
  return out;
};

const SPEECH: Record<string, TranscriptWord[]> = {
  c1: words([["Wait for the cheese pull on this one", 600], ["we smash every patty to order", 3100]]),
  c2: words([["twenty of these a day and that is it", 900]]),
  c3: [],
};

function facts(brightness: "dark" | "ok" | "bright", level: "ok" | "quiet", hasAudio = true): ClipFacts {
  const luma = brightness === "dark" ? 0.22 : brightness === "bright" ? 0.76 : 0.48;
  return {
    method: "mediabunny",
    visual: { sampled: [0.2, 2.4, 4.8].map((t) => ({ t, luma, contrast: 0.19, clipHi: 0.01, clipLo: 0.04, warmth: 0.05 })), sceneCuts: [2.4], medianLuma: luma, brightness, contrast: "ok", warmth: "neutral", clippedHighlights: false, crushedShadows: brightness === "dark" },
    audio: hasAudio ? { hasAudio: true, rmsDb: level === "quiet" ? -31 : -19, peakDb: -4, audibleRatio: 0.82, silences: [{ start: 5.6, end: 6.7 }], level } : { hasAudio: false, rmsDb: null, peakDb: null, audibleRatio: null, silences: [], level: "silent" },
  };
}

function card(over: Partial<ClipCard> & Pick<ClipCard, "subject" | "setting" | "action" | "moments" | "tags">): ClipCard {
  return { people: "one", speech: { present: false, summary: "", hookLine: null }, quality: { visual: "ok", audio: "ok", notes: [] }, openerCandidate: false, model: "lab", createdAt: NOW, ...over };
}

/** Three clips from one shoot, each with frames from the sample video. */
export function clips(thumbs: Thumb[], durationSec: number): StudioClip[] {
  const d = Math.max(8, durationSec);
  const frames = (from: number) => thumbs.slice(from, from + 3).map((t) => ({ t: r2(t.t), url: t.src }));
  const base = { projectId: PROJECT_ID, mime: "video/quicktime", bytes: 48_200_000, width: 1080, height: 1920, recordedAt: "2026-11-01T17:12:00.000Z", status: "ready" as const, error: null, expiresAt: null, reused: false };
  return [
    { ...base, id: "c1", position: 0, name: "IMG_2041.MOV", durationSec: d, facts: facts("ok", "ok"), transcript: { provider: "lab", language: "en", text: SPEECH.c1.map((w) => w.text).join(" "), words: SPEECH.c1, durationMs: null, createdAt: NOW }, frames: frames(0),
      card: card({ subject: "a smash burger on the grill", setting: "the kitchen line, overhead light", action: "the patty is pressed and the cheese melts over it", moments: [{ start: 0.4, end: 3.6, label: "cheese pull", strength: "strong", why: "the cheese stretches as the spatula lifts; the spoken hook lands here" }, { start: 3.6, end: Math.min(d, 7.5), label: "pressing the patty", strength: "good", why: "clear action, steady framing" }], speech: { present: true, summary: "Explains the smash-to-order method.", hookLine: "Wait for the cheese pull on this one" }, tags: ["burger", "kitchen", "cheese", "grill"], openerCandidate: true }) },
    { ...base, id: "c2", position: 1, name: "IMG_2042.MOV", durationSec: d, facts: facts("dark", "quiet"), transcript: { provider: "lab", language: "en", text: SPEECH.c2.map((w) => w.text).join(" "), words: SPEECH.c2, durationMs: null, createdAt: NOW }, frames: frames(3),
      card: card({ subject: "boxing an order at the counter", setting: "the counter, warm light", action: "two boxes are closed and bagged", moments: [{ start: 0.8, end: 4.2, label: "closing the boxes", strength: "good", why: "the hands and the boxes fill the frame" }, { start: 4.2, end: Math.min(d, 8), label: "bagging", strength: "weak", why: "the camera drops to the floor for a moment" }], speech: { present: true, summary: "Says only twenty are made a day.", hookLine: null }, quality: { visual: "dark", audio: "quiet", notes: ["darker than the other clips", "voice sits low"] }, tags: ["counter", "order", "box", "burger"] }) },
    { ...base, id: "c3", position: 2, name: "IMG_2043.MOV", durationSec: d, facts: facts("ok", "ok", false), transcript: null, frames: frames(6),
      card: card({ subject: "the menu board", setting: "the front of the shop at dusk", action: "a slow pan across the board to the door", moments: [{ start: 0, end: 3.4, label: "the menu board", strength: "good", why: "readable board, no one in the way" }], tags: ["menu", "shopfront", "sign"] }) },
  ];
}

export function yieldResult(): YieldResult {
  return {
    opportunities: [
      { idx: 0, title: "The cheese pull, smash to order", angle: "The spoken hook and the cheese pull carry a post about making every burger fresh.", clipIds: ["c1", "c2"], moments: [{ clipId: "c1", start: 0.4, end: 3.6 }, { clipId: "c1", start: 3.6, end: 7.5 }, { clipId: "c2", start: 0.8, end: 4.2 }], opener: { clipId: "c1", start: 0.4, end: 3.6, why: "a hook line is spoken early" }, cta: "Come before 10 and get one of the twenty", evidence: { clips: 2, usableSec: 11, distinctMoments: 3, hasOpener: true, hasSpeech: true }, strength: "strong" },
      { idx: 1, title: "Where to find us", angle: "The menu board and the door make a short post about the place itself.", clipIds: ["c3"], moments: [{ clipId: "c3", start: 0, end: 3.4 }, { clipId: "c3", start: 3.4, end: 8 }], opener: null, cta: null, evidence: { clips: 1, usableSec: 8, distinctMoments: 2, hasOpener: false, hasSpeech: false }, strength: "possible" },
    ],
    rejected: [{ title: "Bagging the order", reason: "Only 4s of usable footage after “The cheese pull, smash to order” took its shared clips (a post needs at least 8s)." }],
    clipsAnalyzed: 3, footageSec: 3 * 9, summary: "One shoot in the kitchen and at the counter, with a spoken hook on the first clip.", createdAt: NOW, model: "lab",
  };
}

export function project(thumbs: Thumb[], durationSec: number, state: "collecting" | "ready"): StudioProject {
  return { id: PROJECT_ID, title: "Friday shoot", status: state, progress: null, yield: state === "ready" ? yieldResult() : null, error: null, createdAt: NOW, updatedAt: NOW, clips: clips(thumbs, durationSec), builds: state === "ready" ? [0] : [] };
}

export const summary = (): ProjectSummary => ({ id: PROJECT_ID, title: "Friday shoot", status: "ready", clips: 3, posts: 2, updatedAt: NOW });

const forEdl = (cs: StudioClip[]): ClipForEdl[] => cs.map((c) => ({ id: c.id, position: c.position, durationSec: c.durationSec ?? 0, words: c.transcript?.words ?? null, silences: c.facts?.audio?.silences ?? null, medianLuma: c.facts?.visual?.medianLuma ?? null, warmth: 0.05, brightness: c.facts?.visual?.brightness ?? null, contrastLevel: "ok", rmsDb: c.facts?.audio?.rmsDb ?? null, audioLevel: c.facts?.audio?.level ?? null, hasSpeech: Boolean(c.transcript?.words?.length) }));

/** SOCIA's cut of the first post. */
export function edl(durationSec: number): Edl {
  const d = Math.max(8, durationSec);
  return {
    version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 8, max: 15 },
    segments: [
      { id: "s1", clipId: "c1", in: 0.4, out: 3.6, role: "opener", note: "the cheese pull and the spoken hook" },
      { id: "s2", clipId: "c2", in: 0.8, out: 3.8, role: "body", note: "boxing the order", transition: "zoom" },
      { id: "s3", clipId: "c1", in: 3.6, out: Math.min(d, 6.2), role: "body", note: "pressing the patty", transition: "whip" },
      { id: "s4", clipId: "c3", in: 0, out: 3.2, role: "ending", note: "the menu board", transition: "fade" },
    ],
    text: [
      { id: "t1", at: 0.2, end: 2.8, text: "Wait for the cheese pull", role: "opening", presetId: "hook_title" },
      { id: "t2", at: 9.2, end: 11.4, text: "Come before 10", role: "cta", presetId: "callout_box" },
    ],
    captions: { source: "transcript" }, enhance: [{ clipId: "c2", kind: "brighten", amount: "slight", why: "darker than the rest" }], audio: [{ clipId: "c2", gainDb: 6, why: "quieter than the other clips" }],
    cta: "Come before 10 and get one of the twenty", music: "Light upbeat instrumental, 100 to 115 BPM, kept low under the speech", caption: "Twenty a day, smashed to order. Come before 10.", notes: [], style: CAPCUT_STYLE, cleanSound: false, lookAuto: NOW,
  };
}

export function build(thumbs: Thumb[], durationSec: number, idx = 0): StudioBuild {
  const e = idx === -1 ? manualEdl(durationSec) : edl(durationSec);
  return { id: idx === -1 ? MANUAL_BUILD_ID : BUILD_ID, projectId: PROJECT_ID, opportunityIdx: idx, edl: e, guide: guideFromEdl(e, forEdl(clips(thumbs, durationSec))), caption: e.caption || null, createdAt: NOW, durationSec: 12, footageExpired: false, regenerations: 1, historyLength: 1, renderPath: null, renderedAt: null, postId: null };
}

function manualEdl(durationSec: number): Edl {
  const d = Math.max(8, durationSec);
  return { ...edl(durationSec), segments: ["c1", "c2", "c3"].map((clipId, i) => ({ id: `s${i + 1}`, clipId, in: 0, out: d, role: i === 0 ? "opener" : i === 2 ? "ending" : "body", note: "" })), text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] };
}

export function playerData(thumbs: Thumb[], durationSec: number, idx = 0): BuildPlayerData {
  const cs = clips(thumbs, durationSec);
  const sources: BuildSource[] = cs.map((c) => ({ clipId: c.id, position: c.position, name: c.name, url: SAMPLE_URL, thumb: c.frames[0]?.url ?? null, durationSec: c.durationSec ?? 0, width: 1080, height: 1920, words: c.transcript?.words ?? null, moments: c.card?.moments ?? [] }));
  return { build: build(thumbs, durationSec, idx), sources, canEdit: true, manual: idx === -1, presets: { brand: null, templates: [] }, canManageBrand: true, music: {} };
}

export const videos = (): VideoSummary[] => [
  { id: BUILD_ID, projectId: PROJECT_ID, title: "The cheese pull, smash to order", kind: "idea", updatedAt: NOW, rendered: true, postId: "p1" },
  { id: "fx-build-2", projectId: PROJECT_ID, title: "20 seconds, open on the cheese pull", kind: "brief", updatedAt: "2026-11-02T09:00:00.000Z", rendered: false, postId: null },
];

export const library = (thumbs: Thumb[], durationSec: number): LibraryClip[] => clips(thumbs, durationSec).map((c) => ({ id: c.id, projectId: PROJECT_ID, projectTitle: "Friday shoot", name: c.name, durationSec: c.durationSec, bytes: c.bytes, addedAt: NOW, thumb: c.frames[0]?.url ?? null }));

/** A Rate analysis of the sample video. Illustrative. */
export function analysis(durationSec: number): StudioAnalysis {
  const d = Math.max(8, Math.round(durationSec));
  const cat = (id: StudioAnalysis["categories"][number]["id"], score: number | null, explanation: string, evidence: string, fix: string) => ({ id, score, explanation, evidence, fix });
  return {
    kind: "video", durationSec: d, score: { overall: 64, label: "Needs work before posting" },
    categories: [
      cat("hook", 58, "The first frame is the grill with no words; the spoken hook lands at 0.6 s but nothing is on screen.", "Frame at 0.0 s: the grill, no text. Speech starts at 0.6 s.", "Put the hook on screen from 0 s in a Hook Title."),
      cat("structure", 70, "Setup, the press, the box and the board: a clear order with a payoff at 8 s.", "Segments at 0 to 3.6 s, 3.6 to 7.5 s, 8 s on.", "Hold the payoff a beat longer."),
      cat("pacing", 61, "One cut in the first 4 s, then a 4 s hold on the counter.", "Frames at 3.6 s and 7.5 s show the same angle.", "Cut the counter hold to 2.5 s."),
      cat("clarity", 74, "A burger shop making burgers to order: obvious without sound.", "Patty, cheese, box, board in order.", ""),
      cat("visual", 66, "Well lit on the grill; the counter clip reads dark.", "Median luma 0.22 on the counter frames.", "Brighten the counter clip slightly."),
      cat("captions", null, "Not assessable from what was provided.", "", ""),
      cat("audio", 59, "Speech measured quiet at -27 dBFS with a steady background hum.", "Measured -27 dBFS over the audible parts; noise floor -41 dBFS.", "Even out the level and turn the hum down."),
      cat("cta", 52, "The ending shows the board and stops; nothing is asked.", "Last 3 s: the board, no text, no speech.", "End on the ask, on screen."),
      cat("goal", 68, "Local orders: the place and the product are both shown; the offer is missing.", "Board visible at 8 s.", "Name the deal in the ending line."),
    ],
    observed: { subjectAppearsAt: 0.4, faceSeen: false, onScreenText: false, ctaDetected: false, summary: "A smash burger made to order, boxed, then the shopfront; the voice starts at 0.6 s." },
    markers: [{ t: 0.6, kind: "text", label: "Spoken hook, nothing on screen" }, { t: 3.6, kind: "strong", label: "Cheese pull" }, { t: 7.5, kind: "pacing", label: "Counter hold drags" }, { t: d - 2, kind: "cta", label: "No ask at the end" }],
    segments: [{ start: 0, end: 3.6, label: "Hook and cheese pull", rating: "strong", reason: "The spoken line and the pull land together." }, { start: 3.6, end: 7.5, label: "Pressing and boxing", rating: "needs", reason: "The same angle holds for 4 s." }, { start: 7.5, end: d, label: "The board", rating: "good", reason: "Readable, but nothing is asked." }],
    topFixes: [
      { title: "The opening has no words on screen", observed: "The hook is spoken at 0.6 s but the first frames show only the grill.", suggestion: "Put the hook on screen from 0 s, in the words already said.", kind: "opening", t: 0, apply: { field: "hook", value: "Wait for the cheese pull" } },
      { title: "The ending asks for nothing", observed: "The last three seconds show the board and stop.", suggestion: "Close on the ask, on screen.", kind: "ending", t: d - 3, apply: { field: "cta", value: "Come before 10" } },
      { title: "The voice sits low with a hum under it", observed: "Measured -27 dBFS over the spoken parts, with a steady hum.", suggestion: "Even out the level and reduce the background noise.", kind: "audio", t: 0.6, apply: null },
    ],
    hooks: { current: "Wait for the cheese pull on this one", options: [{ style: "curiosity", text: "Watch what the cheese does" }, { style: "direct", text: "Twenty burgers a day, smashed to order" }, { style: "local", text: "Downtown's smash burger, made while you wait" }, { style: "story", text: "We pressed our first patty at 6am" }] },
    cta: { current: null, options: ["Come before 10", "Tag who you're bringing", "Save this for Friday"] },
    onScreenText: [{ t: 0, text: "Wait for the cheese pull", role: "opening" }, { t: 4, text: "twenty a day", role: "mid" }, { t: d - 3, text: "Come before 10", role: "cta" }],
    cuts: { currentSec: d, suggestedSec: d - 1.5, edits: [{ type: "trim", start: 5.6, end: 7.1, reason: "the counter holds with nothing said" }], note: "" },
    audio: { observed: "Speech starts at 0.6 s and runs under a steady hum; no music or beat.", direction: { style: "Light upbeat instrumental", bpm: "100 to 115", texture: "Plucked guitar, soft kick", why: "Matches the quick cuts without fighting the voice." }, alternative: { style: "Warm lo-fi", bpm: "80 to 90", texture: "Rhodes, brushed drums", why: "Suits the dusk shopfront ending." } },
    platformFit: [{ platform: "Instagram Reels", fit: "strong", note: "Vertical, under 15 s, a spoken hook." }, { platform: "TikTok", fit: "medium", note: "Needs on-screen words in the first second." }, { platform: "YouTube Shorts", fit: "medium", note: "Short, but the ending needs an ask." }],
    compare: null, niche: null, caption: { current: null, suggestion: "Twenty a day, smashed to order. Come before 10 and get one." },
    strengths: ["The cheese pull at 3.6 s is the strongest frame and it lands with the spoken line.", "The order of shots tells a story without sound."],
    planFit: null,
    meta: { frames: 10, hadTranscript: true, analyzedAt: NOW, version: 1, audioMeasured: true, autoTranscript: true },
    measuredAudio: { durationSec: d, hasAudio: true, levelDb: -27, peakDb: -4, level: "quiet", audibleRatio: 0.84, silentOpeningSec: 0, longestPauseSec: 1.5, pauses: [{ start: 5.6, end: 7.1 }], bpm: null, bpmConfidence: 0, musicLikely: false },
  };
}

export const transcript = () => ({ text: SPEECH.c1.map((w) => w.text).join(" "), words: SPEECH.c1.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })) });
