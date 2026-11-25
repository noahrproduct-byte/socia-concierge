// "Adapt to my business" (Noah, 2026-11-24): a viral Reel from any industry, its creative mechanism translated
// into a video this business can film, with a step-by-step brief. Written only when the person asks, cached per
// Reel and business profile (a change to the profile writes it fresh), and honest about what SOCIA knows of the
// original: its caption, its numbers and its cover image, never the footage or the sound.
// This file is the pure part (schema, prompt, cleaning, cache key, brief text). Pure and browser-safe.

import type { ProvenReel } from "./trendSignals";

/** A personalized adaptation of one Reel. */
export type Adaptation = {
  concept: string;
  hook: string;
  /** What it keeps from the original: the mechanism, in a sentence. */
  keeps: string;
  /** Step-by-step filming instructions. */
  steps: string[];
  /** Camera angles and shots. */
  shots: string[];
  editing: string;
  onScreenText: string[];
  cta: string;
  durationSec: number;
  why: string;
  at: string;
};

/** Adaptations per Reel: the first and two more ("Try another adaptation"). */
export const ADAPTATIONS_PER_REEL = 3;
/** Reels whose adaptations are kept for a brand. */
export const ADAPTED_KEPT = 40;

export const ADAPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concept", "hook", "keeps", "steps", "shots", "editing", "onScreenText", "cta", "durationSec", "why"],
  properties: {
    concept: { type: "string" },
    hook: { type: "string" },
    keeps: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    shots: { type: "array", items: { type: "string" } },
    editing: { type: "string" },
    onScreenText: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    durationSec: { type: "integer" },
    why: { type: "string" },
  },
} as const;

export const ADAPT_SYSTEM = `You are SOCIA's creative director. A business owner found a Reel that did well, usually from a different industry, and wants a video for their own business built on the same creative idea.
Find the mechanism that made the original work (its hook structure, the way it reveals or compares things, its pacing, its format) and rebuild that mechanism around this business's own products, place, people, customers and know-how. Never swap a few words into the original idea; a pizza place adapting "three outfits, three moods" makes three pizzas for three moods, filmed the same way.
Rules:
- You know the original only from what is given: its caption, its numbers and, when attached, its cover image. You have not seen or heard the video. Never describe its footage, cuts, sound or on-screen text beyond what the caption and cover show; when you infer the format, say "likely".
- Only facts the business profile states: no prices, offers, awards, results or claims it doesn't give. Never promise views or results.
- Write for someone who has never made a video: what to film, where to put the phone, what to say, in order. Never "create engaging content" or "showcase your products".
- concept: one sentence. hook: the first words said or shown, at most 12 words, in the brand's voice. keeps: one sentence on what it takes from the original.
- steps: 4 to 7 numbered-free steps, each one action (set up, film, say). shots: 2 to 6 shots with the camera angle and distance. editing: one or two sentences (cuts, transitions, pacing, captions). onScreenText: 1 to 5 short text overlays in sentence case. cta: one action. durationSec: 7 to 60. why: one or two sentences on why it could work for this business, framed as a reason, not a prediction.
- Plain text, sentence case, no markdown, no hashtags, no em dashes.`;

const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, n) : "");
const lines = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => line(x, n)).filter(Boolean).slice(0, max) : []);

/** The model's adaptation made safe: bounded, no em dashes, a sensible length. null when it lacks a concept or steps. Pure. */
export function cleanAdaptation(raw: unknown, now: Date): Adaptation | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const concept = line(o.concept, 220);
  const steps = lines(o.steps, 240, 7);
  if (!concept || steps.length < 2) return null;
  const d = Math.round(Number(o.durationSec));
  return {
    concept, steps,
    hook: line(o.hook, 140),
    keeps: line(o.keeps, 240),
    shots: lines(o.shots, 200, 6),
    editing: line(o.editing, 360),
    onScreenText: lines(o.onScreenText, 80, 5),
    cta: line(o.cta, 140),
    durationSec: Number.isFinite(d) ? Math.max(7, Math.min(60, d)) : 20,
    why: line(o.why, 360),
    at: now.toISOString(),
  };
}

/** The Reel as SOCIA knows it, for the prompt: only what the platform gave. Pure. */
export function reelFacts(r: Pick<ProvenReel, "accountName" | "accountHandle" | "platform" | "format" | "title" | "line" | "views" | "likes" | "comments" | "multiplier" | "basis" | "publishedAt" | "structures" | "topics"> & { fitStructure?: string }, hasCover: boolean): string {
  const n = (v: number | null) => (v == null ? null : v.toLocaleString("en-US"));
  return [
    `Account: ${r.accountHandle ? `@${r.accountHandle.replace(/^@/, "")}` : r.accountName} on ${r.platform === "youtube" ? "YouTube" : "Instagram"}`,
    `Format: ${r.format}`,
    r.title ? `Caption (first line): ${r.title}` : "Caption: not available",
    r.line && r.line !== r.title ? `Opening line read from the caption: ${r.line}` : "",
    [n(r.views) && `${n(r.views)} views`, n(r.likes) && `${n(r.likes)} likes`, n(r.comments) && `${n(r.comments)} comments`].filter(Boolean).join(", ") || "",
    r.multiplier != null ? `About ${r.multiplier >= 10 ? r.multiplier.toFixed(0) : r.multiplier.toFixed(1)} times that account's usual ${r.basis}` : "",
    r.structures.length ? `Hook structure SOCIA recognised: ${r.structures.join(", ")}` : "",
    r.topics.length ? `Topics SOCIA recognised: ${r.topics.join(", ")}` : "",
    r.publishedAt ? `Posted: ${r.publishedAt.slice(0, 10)}` : "",
    r.fitStructure ? `The creative structure SOCIA judged transfers to this business: ${r.fitStructure}. Build the adaptation on it.` : "",
    hasCover ? "Its cover image is attached." : "No cover image is available.",
  ].filter(Boolean).join("\n");
}

/** The step's instructions: the Reel, the business, and the adaptations already written for it. Pure. */
export function adaptTask(facts: string, business: string[], earlier: Adaptation[]): string {
  return [
    "# The Reel that did well",
    facts,
    "# The business",
    business.length ? business.join("\n") : "Only the account name is known: keep the adaptation general to its kind of business and say what to fill in.",
    earlier.length ? `# Adaptations already written for this Reel (write a clearly different one)\n${earlier.map((a) => `- ${a.concept}`).join("\n")}` : "",
    "Write one adaptation for this business.",
  ].filter(Boolean).join("\n\n");
}

/** A short fingerprint of the business profile: a change to it means the cached adaptations are written fresh. Pure. */
export function profileKey(business: string[]): string {
  let h = 5381;
  for (const ch of business.join("\n")) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** A brand's saved adaptations, made safe: by Reel key, each with its profile key and up to three versions. Pure. */
export type AdaptStore = Record<string, { profile: string; versions: Adaptation[]; at: string }>;

export function sanitizeAdaptStore(v: unknown): AdaptStore {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: AdaptStore = {};
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_:-]{4,60}$/.test(k) || !e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    const versions = (Array.isArray(x.versions) ? x.versions : []).map((a) => cleanAdaptation(a, new Date(typeof (a as { at?: unknown })?.at === "string" ? (a as { at: string }).at : Date.now()))).filter((a): a is Adaptation => a != null).slice(0, ADAPTATIONS_PER_REEL);
    if (!versions.length || typeof x.profile !== "string") continue;
    out[k] = { profile: x.profile.slice(0, 20), versions, at: typeof x.at === "string" ? x.at : versions[versions.length - 1].at };
  }
  return out;
}

/** The store with one Reel's versions saved, keeping the most recently used ADAPTED_KEPT Reels. Pure. */
export function storeWith(store: AdaptStore, key: string, profile: string, versions: Adaptation[], now: Date): AdaptStore {
  const next = { ...store, [key]: { profile, versions: versions.slice(0, ADAPTATIONS_PER_REEL), at: now.toISOString() } };
  const keep = Object.entries(next).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, ADAPTED_KEPT);
  return Object.fromEntries(keep);
}

/** The adaptation as a brief to copy, hand to the editor or plan. Pure. */
export function adaptationText(a: Adaptation, r: Pick<ProvenReel, "accountName" | "accountHandle" | "format" | "url">): string {
  return [
    `Video idea: ${a.concept}`,
    a.hook ? `Opening: "${a.hook}"` : "",
    `Length: about ${a.durationSec} seconds`,
    "How to film it:",
    ...a.steps.map((s, i) => `${i + 1}. ${s}`),
    a.shots.length ? `Shots: ${a.shots.join("; ")}` : "",
    a.editing ? `Editing: ${a.editing}` : "",
    a.onScreenText.length ? `On-screen text: ${a.onScreenText.map((t) => `"${t}"`).join(", ")}` : "",
    a.cta ? `Call to action: ${a.cta}` : "",
    a.why ? `Why it could work: ${a.why}` : "",
    `Adapted from a ${r.format} by ${r.accountHandle ? `@${r.accountHandle.replace(/^@/, "")}` : r.accountName}: ${r.url}`,
  ].filter(Boolean).join("\n");
}
