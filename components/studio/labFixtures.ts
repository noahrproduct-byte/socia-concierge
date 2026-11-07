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
import type { Lesson, RaterOutcome } from "@/lib/raterLog";
import { buildModel, type OutlookReel } from "@/lib/outlook";
import type { OutlookPayload } from "@/lib/outlookLoad";
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
    diagnosis: "Your best shot, the cheese pull, comes after an opening with no words.",
    topFixes: [
      { steps: ["At 0.0s, put \"Wait for the cheese pull\" on screen in the top third, clear of the grill.", "Hold it until 2.0s, then let the words already spoken take over.", "Open on the frame with the patty on the grill, not the empty board."], motion: "The words pop in over 0.2 s, hold still, and cut out on the first flip at 2.0 s.", part: "hook", scoreAfter: 74, aiPrompt: "Vertical 9:16 close-up of a smash burger patty pressed onto a hot flat-top grill, steam rising, cheese melting over the edge. Camera locked off at counter height, warm side light from the left, shallow focus. Slow push in over 2 seconds. No people, no text, no logos.", title: "Fix your opening", priority: "critical", observed: "The hook is spoken at 0.6 s but the first frames show only the grill, with nothing on screen.", suggestion: "Put the hook on screen from 0 s, in the words already said.", why: "A viewer with the sound off gets no reason to stay in the first two seconds.", kind: "opening", t: 0, end: 2, apply: { field: "hook", value: "Wait for the cheese pull" }, evidence: { account: "W1 and W3 both put their first line on screen in the first frame.", niche: "R1 opens on its strongest shot with a four-word line.", confidence: "high", confidenceWhy: "The missing text is visible in the draft itself; how much it matters for this post is not known." } },
      { steps: ["At 5.0s, cut the three-second hold on the board to one second.", "Put \"Come before 10\" on screen in the lower middle for the last two seconds.", "Drop the second ask from the caption so the one line stands alone."], motion: "The line slides up 10% over 0.3 s and holds to the last frame.", part: "cta", scoreAfter: 72, aiPrompt: "", title: "Simplify the ending", priority: "high", observed: "The last three seconds show the board and stop.", suggestion: "Close on one ask, on screen.", why: "The video ends without telling a viewer what to do next.", kind: "ending", t: d - 3, end: d, apply: { field: "cta", value: "Come before 10" }, evidence: { account: "", niche: "", confidence: "moderate", confidenceWhy: "No ask is visible or spoken; your top posts vary in how they end." } },
      { steps: ["In the Video editor, open Look and sound and turn on noise reduction.", "Raise the spoken parts until they sit at about -16 LUFS."], motion: "", part: "audio", scoreAfter: 70, aiPrompt: "", title: "Even out the voice", priority: "medium", observed: "Measured -27 dBFS over the spoken parts, with a steady hum.", suggestion: "Even out the level and reduce the background noise.", why: "Quiet speech is hard to follow on a phone speaker.", kind: "audio", t: 0.6, end: null, apply: null, evidence: { account: "", niche: "", confidence: "high", confidenceWhy: "The level is measured from the video's own sound." } },
      { steps: ["Add one quiet track under your next three comparable Reels.", "Keep it at least 18 dB under the voice.", "Compare the three with your usual after three days each."], motion: "", part: null, scoreAfter: null, aiPrompt: "Instrumental music bed, 100 to 115 BPM, plucked guitar and a soft kick, warm and unhurried, no vocals, 15 seconds, leaves room for speech.", title: "Test a low music bed", priority: "experiment", observed: "Your three posts with library music did better than the seven without, but they also differ in topic and length.", suggestion: "Add a quiet track to your next three comparable Reels and compare.", why: "Three posts is too few to say music is the reason.", kind: "audio", t: null, end: null, apply: null, evidence: { account: "3 posts with music against 7 without.", niche: "", confidence: "low", confidenceWhy: "A small sample, and the posts differ in other ways." } },
    ],
    hooks: { current: "Wait for the cheese pull on this one", options: [{ style: "curiosity", text: "Watch what the cheese does" }, { style: "direct", text: "Twenty burgers a day, smashed to order" }, { style: "local", text: "Downtown's smash burger, made while you wait" }, { style: "story", text: "We pressed our first patty at 6am" }] },
    cta: { current: null, options: ["Come before 10", "Tag who you're bringing", "Save this for Friday"] },
    onScreenText: [{ t: 0, text: "Wait for the cheese pull", role: "opening" }, { t: 4, text: "twenty a day", role: "mid" }, { t: d - 3, text: "Come before 10", role: "cta" }],
    cuts: { currentSec: d, suggestedSec: d - 1.5, edits: [{ type: "trim", start: 5.6, end: 7.1, reason: "the counter holds with nothing said" }], note: "" },
    audio: { observed: "Speech starts at 0.6 s and runs under a steady hum; no music or beat.", direction: { style: "Light upbeat instrumental", bpm: "100 to 115", texture: "Plucked guitar, soft kick", why: "Matches the quick cuts without fighting the voice." }, alternative: { style: "Warm lo-fi", bpm: "80 to 90", texture: "Rhodes, brushed drums", why: "Suits the dusk shopfront ending." } },
    platformFit: [{ platform: "Instagram Reels", fit: "strong", note: "Vertical, under 15 s, a spoken hook." }, { platform: "TikTok", fit: "medium", note: "Needs on-screen words in the first second." }, { platform: "YouTube Shorts", fit: "medium", note: "Short, but the ending needs an ask." }],
    compare: {
      basis: "your top 3 posts by views and their cover frames", sample: 3,
      rows: [
        { label: "Words on screen at 0 s", current: "None", winners: "A short line in the first frame", verdict: "worse", refs: ["W1", "W3"] },
        { label: "Subject visible", current: "0.4 s", winners: "First frame", verdict: "similar", refs: ["W1", "W2", "W3"] },
        { label: "Ending", current: "No ask", winners: "Varies by post", verdict: "unknown", refs: [] },
      ],
      summary: "Your top posts tend to name the food on screen straight away. That is a pattern across three posts, not proof of why they did well.",
      posts: [
        { id: "W1", title: "Friday smash, start to finish", url: "https://www.instagram.com/reel/w1/", thumb: "/landing/cafe/espresso.jpg", account: null, result: "5,012 views, 214 interactions, 2.4x your median" },
        { id: "W2", title: "The griddle at 6am", url: "https://www.instagram.com/reel/w2/", thumb: "/landing/cafe/pastry.jpg", account: null, result: "3,880 views, 150 interactions, 1.7x your median" },
        { id: "W3", title: "Twenty a day", url: null, thumb: null, account: null, result: "2,940 views, 121 interactions" },
      ],
    },
    competitors: {
      basis: "2 Reels that took off for accounts in your niche",
      rows: [
        { label: "How it opens", current: "The grill, no words", theirs: "The finished burger with a four-word line", verdict: "worse", refs: ["R1"] },
        { label: "Length", current: "12 seconds", theirs: "9 to 14 seconds", verdict: "similar", refs: ["R1", "R2"] },
        { label: "The ask", current: "None", theirs: "One ask in the last two seconds", verdict: "worse", refs: ["R2"] },
      ],
      takeaways: ["Open on the finished burger, then show how it was made.", "End on one ask, said and written."],
      summary: "Both Reels show the payoff first and ask for one thing at the end. Their results are theirs; the structure is what you can borrow.",
      posts: [
        { id: "R1", title: "POV: the first bite", url: "https://www.instagram.com/reel/r1/", thumb: "/landing/cafe/beans.jpg", account: "@cornerpatty", result: "240K views, 6.0x their usual" },
        { id: "R2", title: "Why is nobody talking about this bun?", url: "https://www.instagram.com/reel/r2/", thumb: "/landing/cafe/open.jpg", account: "@smashlab", result: "88K views, 3.1x their usual" },
      ],
    },
    experiments: [{ title: "Test a low music bed", hypothesis: "A quiet track may help a no-dialogue stretch hold attention.", basis: "3 of your posts with library music against 7 without; they also differ in topic and length.", how: "Add a track at low volume to your next three comparable Reels and compare each with your median." }],
    directions: [
      { name: "Payoff first", approach: "Open on the cheese pull, then show how it was made.", opening: "Wait for the cheese pull", storyboard: [{ at: "0 to 2s", shot: "The cheese pull, close, with the line on screen", say: "Wait for the cheese pull" }, { at: "2 to 8s", shot: "Patty on the grill, pressed, boxed", say: "Twenty a day, smashed to order" }, { at: "8 to 12s", shot: "The board outside, the ask on screen", say: "Come before 10" }], lengthSec: 12, bestFor: "Showing the food at its best before anyone scrolls.", tradeoff: "The making-of loses its surprise.", evidence: "Your strongest frame is at 3.6 s, and R1 opens on its payoff.", testFirst: true },
      { name: "Question first", approach: "Open on a question the regulars ask, answer it on the grill.", opening: "Why do we only make twenty?", storyboard: [{ at: "0 to 2s", shot: "The empty griddle, the question on screen", say: "Why do we only make twenty?" }, { at: "2 to 9s", shot: "The press and the cheese pull", say: "" }, { at: "9 to 12s", shot: "The board", say: "Come before 10" }], lengthSec: 12, bestFor: "Viewers who already know the shop.", tradeoff: "The food arrives two seconds later.", evidence: "R2 opens with a question.", testFirst: false },
      { name: "Making-of first", approach: "Keep the order you filmed, with words on screen from the start.", opening: "Smashed to order, twenty a day", storyboard: [{ at: "0 to 4s", shot: "The press, the line on screen", say: "" }, { at: "4 to 9s", shot: "Cheese pull and boxing", say: "" }, { at: "9 to 12s", shot: "The board and the ask", say: "Come before 10" }], lengthSec: 12, bestFor: "The least re-editing.", tradeoff: "The strongest shot still comes late.", evidence: "It matches how the draft is already cut.", testFirst: false },
    ],
    niche: null, caption: { current: null, suggestion: "Twenty a day, smashed to order. Come before 10 and get one." },
    strengths: ["The cheese pull at 3.6 s is the strongest frame and it lands with the spoken line.", "The order of shots tells a story without sound."],
    planFit: null,
    meta: { frames: 10, hadTranscript: true, analyzedAt: NOW, version: 1, audioMeasured: true, autoTranscript: true },
    measuredAudio: { durationSec: d, hasAudio: true, levelDb: -27, peakDb: -4, level: "quiet", audibleRatio: 0.84, silentOpeningSec: 0, longestPauseSec: 1.5, pauses: [{ start: 5.6, end: 7.1 }], bpm: null, bpmConfidence: 0, musicLikely: false },
  };
}

export const transcript = () => ({ text: SPEECH.c1.map((w) => w.text).join(" "), words: SPEECH.c1.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })) });

/**
 * The account's Reels for the performance outlook (lib/outlook.ts), built by
 * the real calculation from a made-up history. `mode` picks the state to look
 * at: "forecast" (a pattern strong enough that the replay passes), "thin"
 * (too few Reels), "none" (no Instagram), otherwise the usual case, where the
 * index stays hidden.
 */
export function outlook(mode: string | null): OutlookPayload {
  if (mode === "none") return { connected: false, handle: null, insightsOk: null, model: buildModel([], 0) };
  const at = (i: number, n: number) => new Date(Date.parse(NOW) - (10 + (n - 1 - i) * 4) * 86_400_000).toISOString();
  const wobble = [0.6, 0.8, 1, 1.3, 1.7];
  const noise = [1900, 640, 3100, 1250, 2300, 880, 1500, 2750, 1020, 1700];
  const n = mode === "thin" ? 5 : 44;
  const reels: OutlookReel[] = Array.from({ length: n }, (_, i) => mode === "forecast"
    ? { at: at(i, n), views: Math.round((i % 2 ? 4000 : 1000) * wobble[i % 5]), traits: [i % 2 ? "open:Question" : "open:Listicle hook", "caption:short"] }
    : { at: at(i, n), views: Math.round(noise[(i * 3) % 10] * (i >= n - 8 ? 1.4 : 1)), traits: [i % 3 === 0 ? "open:Question" : "open:Listicle hook", i % 4 === 0 ? "caption:long" : "caption:short", ...(i % 5 === 0 ? ["theme:Behind the scenes"] : [])] });
  return { connected: true, handle: "smashdowntown", insightsOk: true, model: buildModel(reels, 2) };
}

/** The rater's memory: three earlier videos, at each stage, and one lesson (lib/raterLog.ts). */
export function raterLog(): { outcomes: RaterOutcome[]; lessons: Lesson[] } {
  const fix = (title: string, kind: RaterOutcome["fixes"][number]["kind"], applied: boolean): RaterOutcome["fixes"][number] => ({ title, kind, priority: "high", applied });
  const outcomes: RaterOutcome[] = [
    { postId: "post-0001", at: "2026-10-28T15:00:00.000Z", score: 61, diagnosis: "The strongest proof was hidden behind a weak opening.", fixes: [fix("Fix your opening", "opening", true), fix("Simplify the ending", "ending", true)], direction: "Payoff first", hook: "Wait for the cheese pull", cta: "Come before 10", state: "published", publishedAt: "2026-10-29T17:00:00.000Z", permalink: "https://www.instagram.com/reel/abc/", outlook: { kind: "usual", n: 24, median: 1700, low: 1000, high: 2700, index: null }, result: { short: "1.6x your median", text: "1.6x your typical Instagram post.", measured: true, early: false, multiplier: 1.6, views: 3100 } },
    { postId: "post-0002", at: "2026-11-02T15:00:00.000Z", score: 66, diagnosis: "The ending asked for three things at once.", fixes: [fix("Simplify the ending", "ending", true), fix("Even out the voice", "audio", false)], direction: null, hook: "Twenty a day, smashed to order", cta: "Tag who you're bringing", state: "published", publishedAt: "2026-11-04T17:00:00.000Z", permalink: null, result: { short: "0.9x your median so far", text: "0.9x your typical Instagram post so far.", measured: true, early: true, multiplier: 0.9 } },
    { postId: "post-0003", at: "2026-11-04T15:00:00.000Z", score: 64, diagnosis: "Your best shot comes after an opening with no words.", fixes: [fix("Fix your opening", "opening", false)], direction: null, hook: null, cta: null, state: "draft", publishedAt: null, permalink: null, result: null },
  ];
  return { outcomes, lessons: [{ kind: "ending", posts: 3, above: 2, median: 1.4, line: "When you changed the ending: 3 posts, median 1.4x your usual, 2 of 3 above it. A pattern in your own posts, not proof the change is the reason." }] };
}
