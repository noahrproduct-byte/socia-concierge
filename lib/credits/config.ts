// Credits: the one place every AI Clipper and AI Studio price lives.
//
// Credits exist because Vizard and Higgsfield charge SOCIA per use. Each plan
// gets a monthly allowance; every action costs credits set from what it costs
// SOCIA (CREDIT_USD is what one credit is worth to us), with a margin. Tune the
// numbers here; nothing else in the code knows a price.
//
// Provider prices are NOT published in their docs (Higgsfield shows them in
// console.higgsfield.ai, Vizard bills in plan minutes), so the USD figures
// below are placeholders to confirm against the consoles after the first live
// test (docs/ai-studio-test-plan.md). Client-safe: no server imports.
import type { PlanId } from "@/lib/plans";

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
  // $80 a month: about $40 of provider cost at the margin above.
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

export type GenerationKind = "text_to_video" | "image_to_video" | "text_to_image";

/**
 * The curated Higgsfield models people can pick from (not the whole catalogue).
 * `usdPerSecond` for video, `usdPerImage` for images: SOCIA's cost before the
 * margin. Placeholders until confirmed in the console.
 */
export type GenerationModel = {
  id: string;
  name: string;
  tier: "fast" | "premium";
  kinds: GenerationKind[];
  /** Higgsfield endpoint path per kind, under https://api.higgsfield.ai/ */
  endpoints: Partial<Record<GenerationKind, string>>;
  usdPerSecond?: number;
  usdPerImage?: number;
  /** Allowed output lengths in seconds (video only). */
  durations?: number[];
  aspectRatios?: string[];
  note: string;
};

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "hailuo-2.3-standard",
    name: "Hailuo 2.3 (fast)",
    tier: "fast",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "minimax/hailuo-2.3/standard/text-to-video", image_to_video: "minimax/hailuo-2.3/standard/image-to-video" },
    usdPerSecond: 0.05,
    durations: [6, 10],
    aspectRatios: ["9:16", "16:9", "1:1"],
    note: "Quick drafts at 768p. Good for testing an idea before spending more.",
  },
  {
    id: "kling-3.0-standard",
    name: "Kling 3.0 (premium)",
    tier: "premium",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "kling-video/v3.0/std/text-to-video", image_to_video: "kling-video/v3.0/std/image-to-video" },
    usdPerSecond: 0.112,
    durations: [5, 8, 10],
    aspectRatios: ["9:16", "16:9", "1:1"],
    note: "Sharper motion and sound, 3 to 15 seconds.",
  },
  {
    id: "soul-2-standard",
    name: "SOUL 2 (images)",
    tier: "fast",
    kinds: ["text_to_image"],
    endpoints: { text_to_image: "higgsfield-ai/soul/v2/standard" },
    usdPerImage: 0.04,
    aspectRatios: ["9:16", "1:1", "4:5", "16:9"],
    note: "Still images for covers and carousels.",
  },
];

export const DEFAULT_MODEL: Record<GenerationKind, string> = {
  text_to_video: "hailuo-2.3-standard",
  image_to_video: "hailuo-2.3-standard",
  text_to_image: "soul-2-standard",
};

export function modelById(id: string): GenerationModel | null {
  return GENERATION_MODELS.find((m) => m.id === id) ?? null;
}

const toCredits = (usd: number) => Math.max(1, Math.ceil((usd * MARGIN) / CREDIT_USD));

/** Credits to clip a source video of `minutes` minutes. Rounded up to the whole minute, as Vizard bills. */
export function clipCredits(minutes: number, model: "clip_v1" | "clip_v2" = "clip_v1"): number {
  const whole = Math.max(1, Math.ceil(minutes));
  return toCredits(whole * CLIP_SOURCE_USD_PER_MINUTE * CLIP_MODEL_FACTOR[model]);
}

/** Credits for one generation. null when the model does not do that kind. */
export function generationCredits(modelId: string, kind: GenerationKind, seconds = 0): number | null {
  const m = modelById(modelId);
  if (!m || !m.kinds.includes(kind)) return null;
  if (kind === "text_to_image") return m.usdPerImage == null ? null : toCredits(m.usdPerImage);
  if (m.usdPerSecond == null) return null;
  return toCredits(Math.max(1, seconds) * m.usdPerSecond);
}

/** "12 credits" / "1 credit". */
export function formatCredits(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;
}
