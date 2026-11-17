// Credits: the one place every AI price lives.
//
// Every AI action (Ask SOCIA, ratings, Content Plans, captions, animated
// videos, voiceovers, footage analyses, the Clipper, AI Studio) is paid from
// one monthly credit balance (Noah, 2026-11-15: "they can just use on
// everything they want ... once they hit those, that's it"). Each action costs
// credits set from what it costs SOCIA (CREDIT_USD is what one credit is worth
// to us), with a margin. Monthly credits don't roll over; top-ups do. Tune the
// numbers here.
//
// AI Studio generations are priced from Higgsfield's live estimate for the
// exact request (lib/generation/server.ts), so no generation price lives here.
// The clipper figures below are placeholders to confirm after the first live
// test (docs/ai-studio-test-plan.md). Client-safe: no server imports.
import type { PlanId } from "@/lib/plans";
import { FULL_PRICE, launchOn } from "@/lib/launch";

/**
 * False until the provider prices below are confirmed against the Vizard and
 * Higgsfield consoles after the first live test (docs/ai-studio-test-plan.md).
 * While false, credit top-ups are closed and running short says the credits
 * refill on the 1st. Scale itself is sold on its own switch (lib/plans.ts
 * SCALE_ON_SALE). Set to true in the same change that enters the real prices.
 */
export const CREDIT_PRICES_CONFIRMED = false;

/** What one credit is worth to SOCIA in US dollars. 100 credits = $1. */
export const CREDIT_USD = 0.01;

/** Margin over SOCIA's cost, applied to every price below. 1.5 = cost plus half. */
export const MARGIN = 1.5;

/**
 * Credits a plan gets on the first of every month, for every AI action. Sized
 * so a customer who spends them all costs SOCIA about 60% of the plan's price
 * (Starter 1,800 credits = $12 of AI at the margin above). Scale's are sized
 * for AI Studio video (Noah, 2026-11-16): 9,000 at the $79.99 launch price
 * keeps about $14 from a customer who spends them all. Unused monthly credits expire
 * at the end of the month (supabase/credits-monthly.sql); top-ups don't.
 */
export const MONTHLY_CREDITS: Record<PlanId, number> = {
  free: 300,
  starter: 1800,
  growth: 3300,
  pro: 4800,
  scale: 9000,
};

/**
 * Monthly credits for subscribers paying a plan's full price (lib/launch.ts
 * FULL_PRICE, from December 16, 2026). Launch subscribers keep their launch
 * price and MONTHLY_CREDITS. Noah, 2026-11-15: a busy Pro agency with five
 * brands needs about 6,000 credits a month; 7,200 covers that, and at $79.99
 * a customer who spends them all still leaves about $22. Scale at $119.99
 * gets 13,500 (Noah, 2026-11-16): about 18 minutes of Kling 3.0 if all spent
 * on video, and still about $21 kept at full use.
 */
export const FULL_PRICE_CREDITS: Partial<Record<PlanId, number>> = { pro: 7200, scale: 13500 };

/** A plan's monthly credits for what the subscriber pays, in cents (null when unknown: the launch amount). */
export function planCredits(plan: PlanId, priceCents?: number | null): number {
  const full = FULL_PRICE_CREDITS[plan];
  if (full == null || plan === "free" || priceCents == null) return MONTHLY_CREDITS[plan];
  return priceCents >= Math.round(FULL_PRICE[plan] * 100) ? full : MONTHLY_CREDITS[plan];
}

/** The monthly credits a plan is sold with right now: launch amounts until the launch ends, full-price amounts after. */
export function creditsOnSale(plan: PlanId, now: number = Date.now()): number {
  if (plan === "free" || launchOn(now)) return MONTHLY_CREDITS[plan];
  return planCredits(plan, Math.round(FULL_PRICE[plan] * 100));
}

/**
 * What one use of each AI feature costs SOCIA, in US dollars (estimates from
 * prompt sizes and list prices, 2026-11-15; every call's real cost is
 * recorded by lib/aiSpend.ts, so these can be checked against it).
 */
export const ACTION_USD = {
  ask_socia: 0.035,
  content_studio: 0.25,
  content_generation: 0.04,
  account_audit: 0.03,
  content_plan: 0.3,
  content_ideas: 0.05,
  content_build: 0.34,
  video_builds: 0.02,
  animated_videos: 0.26,
  music_tracks: 0.1,
  voiceovers: 0.07,
} as const;
export type CreditAction = keyof typeof ACTION_USD;

export const isCreditAction = (m: string): m is CreditAction => Object.prototype.hasOwnProperty.call(ACTION_USD, m);

/** Credits one use of an AI feature costs. Fixed per action, so people can see what something will cost before they press it. */
export const actionCredits = (a: CreditAction): number => creditsForUsd(ACTION_USD[a]);

/** The few examples shown beside a credit amount, so "1,800 credits" means something. */
export const CREDIT_EXAMPLES: { action: CreditAction; one: string; many: string }[] = [
  { action: "content_studio", one: "video rating", many: "video ratings" },
  { action: "animated_videos", one: "animated video", many: "animated videos" },
  { action: "ask_socia", one: "Ask SOCIA question", many: "Ask SOCIA questions" },
];

/**
 * "about 47 video ratings, 46 animated videos or 300 Ask SOCIA questions".
 * `includes` leaves out actions the plan doesn't have (Free has no animated videos).
 */
export function creditsBuy(credits: number, includes: (a: CreditAction) => boolean = () => true): string {
  const parts = CREDIT_EXAMPLES.filter((e) => includes(e.action)).map((e) => {
    const n = Math.floor(credits / actionCredits(e.action));
    return `${n.toLocaleString("en-US")} ${n === 1 ? e.one : e.many}`;
  });
  return parts.length === 1 ? `about ${parts[0]}` : `about ${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

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
  /** The model makes its own sound (video only). Off, SOCIA adds music and voice in the editor. */
  sound?: boolean;
  /** Only on Scale: the premium model (AI Studio opens on Pro). */
  scaleOnly?: boolean;
  note: string;
};

/**
 * AI Studio is on Pro and Scale (lib/plans.ts FEATURE_MIN_PLAN). Pro makes
 * clips up to 10 seconds on the everyday models; Scale adds the premium model
 * and 15-second clips. Side-by-side test 2026-11-16 (reports/ai-video-model-test.mp4):
 * Kling 3.0 without sound was the cheapest and good on every prompt, Wan 3.0
 * as good and better with crowds, Seedance 2.5 the most cinematic at 4-5x the price.
 */
export const MAX_SECONDS: Partial<Record<PlanId, number>> = { pro: 10, scale: 15 };

/** Whether a plan may use a model. Plans without AI Studio never reach here. */
export const planAllowsModel = (plan: PlanId | null | undefined, m: GenerationModel): boolean => !m.scaleOnly || plan === "scale";

/** The lengths a plan may pick on a model: the model's own, up to the plan's longest. */
export function durationsFor(plan: PlanId | null | undefined, m: GenerationModel): number[] {
  const max = (plan && MAX_SECONDS[plan]) ?? MAX_SECONDS.pro ?? 10;
  return (m.durations ?? []).filter((d) => d <= max);
}

/** About how many more generations at `price` credits the balance covers. */
export const shotsLeft = (balance: number | null, price: number | null): number | null =>
  balance == null || price == null || price <= 0 ? null : Math.max(0, Math.floor(balance / price));

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: "kling-3.0-standard",
    name: "Kling 3.0",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "kling-video/v3.0/std/text-to-video", image_to_video: "kling-video/v3.0/std/image-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: false,
    note: "Natural motion and people, without sound (add music or a voiceover in the editor). The best value. Animates a start image too.",
  },
  {
    id: "kling-3.0-sound",
    name: "Kling 3.0 with sound",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "kling-video/v3.0/std/text-to-video", image_to_video: "kling-video/v3.0/std/image-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: true,
    note: "Kling 3.0 with its own sound: ambience and effects. Costs more than without.",
  },
  {
    id: "wan-3.0",
    name: "Wan 3.0",
    kinds: ["text_to_video", "image_to_video"],
    endpoints: { text_to_video: "alibaba/wan-3.0/text-to-video", image_to_video: "alibaba/wan-3.0/image-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: false,
    note: "Good with busy scenes and crowds, 720p, without sound.",
  },
  {
    id: "seedance-2.5",
    name: "Seedance 2.5",
    kinds: ["text_to_video"],
    endpoints: { text_to_video: "bytedance/seedance-2.5/text-to-video" },
    durations: [5, 10, 15],
    aspectRatios: ["9:16", "1:1", "16:9"],
    sound: true,
    scaleOnly: true,
    note: "Premium: the most cinematic, with its own camera cuts and sound, 720p. Costs about four times Kling.",
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
  text_to_video: "kling-3.0-standard",
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

/** What transcribing one minute of source costs SOCIA (lib/aiSpend.ts TRANSCRIBE_USD_PER_HOUR, per minute). */
export const CLIP_TRANSCRIBE_USD_PER_MINUTE = 0.0035;

/** How far one of SOCIA's own clip jobs got before it stopped: what has been paid for. */
export type ClipWorkDone = "none" | "transcription" | "all";

/** The work behind a job's stage: sent for transcription, or the moments being picked (a model call). Pure. */
export function clipWorkDone(job: { status: string; stage?: string | null; provider?: string | null }): ClipWorkDone {
  if (job.status !== "processing" || job.provider !== "socia") return "none";
  if (job.stage === "transcribing") return "transcription";
  return job.stage ? "all" : "none";
}

/**
 * Credits SOCIA keeps when one of its own clip jobs stops early: what the work
 * already done cost, at the usual margin, never more than was spent. Pure.
 */
export function clipCreditsKept(minutes: number, reserved: number, done: ClipWorkDone): number {
  if (done === "none" || !(reserved > 0)) return 0;
  if (done === "all") return reserved;
  return Math.min(reserved, creditsForUsd(Math.max(1, Math.ceil(minutes)) * CLIP_TRANSCRIBE_USD_PER_MINUTE));
}

/** "12 credits" / "1 credit". */
export function formatCredits(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;
}

/** About how many minutes of video a month of credits clips with SOCIA's own clipper, counted in 15-minute videos. */
export function clipMinutesFor(credits: number): number {
  return Math.floor(credits / clipCredits(15, "clip_v1", "socia")) * 15;
}

/** What to say when credits run short. Top-ups are mentioned only when they are on sale. */
export const creditsShortCopy = (topups: boolean): string => topups
  ? "Not enough credits for this. Buy a top-up in Settings or wait for next month's credits."
  : "Not enough credits for this. Your credits refill on the 1st of next month.";
