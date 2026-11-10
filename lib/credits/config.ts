// Credits: the one place every AI Clipper and AI Studio price lives.
//
// Credits exist because Vizard and Higgsfield charge SOCIA per use. Each plan
// gets a monthly allowance; every action costs credits set from what it costs
// SOCIA (CREDIT_USD is what one credit is worth to us), with a margin. Tune the
// numbers here.
//
// AI Studio generations are priced from Higgsfield's live estimate for the
// exact request (lib/generation/server.ts), so no generation price lives here.
// The clipper figures below are placeholders to confirm after the first live
// test (docs/ai-studio-test-plan.md). Client-safe: no server imports.
import type { PlanId } from "@/lib/plans";

/**
 * False until the provider prices below are confirmed against the Vizard and
 * Higgsfield consoles after the first live test (docs/ai-studio-test-plan.md).
 * While false, Scale is not sold (no pricing card, upgrade offer or checkout)
 * and credit top-ups are closed; an account set to Scale by hand still works,
 * so the test can run. Set to true in the same change that enters the real prices.
 */
export const CREDIT_PRICES_CONFIRMED = false;

/** What one credit is worth to SOCIA in US dollars. 100 credits = $1. */
export const CREDIT_USD = 0.01;

/** Margin over SOCIA's cost, applied to every price below. 1.5 = cost plus half. */
export const MARGIN = 1.5;

/** Credits a plan gets on the first of every month. Plans without the features get none. */
export const MONTHLY_CREDITS: Record<PlanId, number> = {
  free: 0,
  starter: 0,
  growth: 0,
  pro: 0,
  // $79.99 a month: about $40 of provider cost at the margin above.
  scale: 6000,
};

/** Top-up packs (one-off Stripe payments). The Price ids come from STRIPE_PRICE_TOPUP_<KEY>. */
export const TOPUP_PACKS = [
  { key: "small", credits: 2000, usd: 20 },
  { key: "large", credits: 6000, usd: 50 },
] as const;
export type TopupKey = (typeof TOPUP_PACKS)[number]["key"];

/** Credits per minute of SOURCE video sent to the clipper (Vizard bills by source minute). */
export const CLIP_SOURCE_USD_PER_MINUTE = 0.05;
/** clip_v2 is billed by Vizard at 1.25x clip_v1. */
export const CLIP_MODEL_FACTOR: Record<"clip_v1" | "clip_v2", number> = { clip_v1: 1, clip_v2: 1.25 };

/**
 * SOCIA's own clipper (lib/clipper/socia.ts): transcription at about $0.21 an
 * hour (lib/aiSpend.ts) plus Claude reading the transcript, per source minute,
 * and a fixed part per job for the pick's answer and the captions. The
 * person's browser renders the clips, so there is no render cost. Placeholders
 * until measured on the first real jobs, like the provider prices above.
 */
export const SOCIA_CLIP_USD_PER_MINUTE = 0.01;
export const SOCIA_CLIP_USD_PER_JOB = 0.1;

export type ClipProviderName = "socia" | "vizard";

export type GenerationKind = "text_to_video" | "image_to_video" | "text_to_image";

/**
 * The curated Higgsfield models people can pick from (not the whole catalogue).
 * Field names and allowed values follow docs.higgsfield.ai (checked 2026-11-10).
 * There are no prices here: Higgsfield doesn't publish them, so every job is
 * priced from its live estimate (lib/generation/server.ts quoteGeneration).
 */
export type GenerationModel = {
  id: string;
  name: string;
  kinds: GenerationKind[];
  /** Higgsfield endpoint path per kind, under https://api.higgsfield.ai/ */
  endpoints: Partial<Record<GenerationKind, string>>;
  /** Output lengths in seconds SOCIA offers (video only), within what the model allows. */
  durations?: number[];
  /** Shapes the model takes for text to video and images. Image to video follows the start image. */
  aspectRatios?: string[];
  /** The model makes its own sound (video only). */
  sound?: boolean;
  note: string;
};

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "seedance-2.5",
    name: "Seedance 2.5",
    kinds: ["text_to_video"],
    endpoints: { text_to_video: "bytedance/seedance-2.5/text-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: true,
    note: "Vertical video with its own sound, 720p.",
  },
  {
    id: "kling-3.0-standard",
    name: "Kling 3.0",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "kling-video/v3.0/std/text-to-video", image_to_video: "kling-video/v3.0/std/image-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: true,
    note: "Sharp motion with its own sound. Animates a start image too.",
  },
  {
    id: "hailuo-2.3-standard",
    name: "Hailuo 2.3",
    kinds: ["image_to_video"],
    endpoints: { image_to_video: "minimax/hailuo-2.3/standard/image-to-video" },
    durations: [6, 10],
    note: "Animates a start image at 768p, without sound.",
  },
  {
    id: "soul-2-standard",
    name: "SOUL 2",
    kinds: ["text_to_image"],
    endpoints: { text_to_image: "higgsfield-ai/soul/v2/standard" },
    aspectRatios: ["9:16", "1:1", "3:4", "16:9"],
    note: "Still images at 1080p for covers and carousels.",
  },
];

export const DEFAULT_MODEL: Record<GenerationKind, string> = {
  text_to_video: "seedance-2.5",
  image_to_video: "kling-3.0-standard",
  text_to_image: "soul-2-standard",
};

export function modelById(id: string): GenerationModel | null {
  return GENERATION_MODELS.find((m) => m.id === id) ?? null;
}

/** Credits for something that costs SOCIA `usd`, with the margin. At least 1. */
export const creditsForUsd = (usd: number): number => Math.max(1, Math.ceil((usd * MARGIN) / CREDIT_USD));

/** Credits to clip a source video of `minutes` minutes. Rounded up to the whole minute, as Vizard bills. */
export function clipCredits(minutes: number, model: "clip_v1" | "clip_v2" = "clip_v1", provider: ClipProviderName = "vizard"): number {
  const whole = Math.max(1, Math.ceil(minutes));
  if (provider === "socia") return creditsForUsd(SOCIA_CLIP_USD_PER_JOB + whole * SOCIA_CLIP_USD_PER_MINUTE);
  return creditsForUsd(whole * CLIP_SOURCE_USD_PER_MINUTE * CLIP_MODEL_FACTOR[model]);
}

/** "12 credits" / "1 credit". */
export function formatCredits(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;
}
