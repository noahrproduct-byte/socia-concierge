import Anthropic from "@anthropic-ai/sdk";

// Zero-arg constructor reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

// Opus 5 is the default; the deliverable quality is the whole product, so we
// don't downgrade for cost here. Override with ANTHROPIC_MODEL if needed.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// ---------------------------------------------------------------------------
// Availability
//
// When the account runs out of credit (or the key is revoked), every AI route
// fails the same way. Sections that render an empty list on failure then look
// like "SOCIA found nothing", which is the one thing this product must never
// imply. These helpers let a route say *why* it has nothing, so the UI can
// state the real reason instead.
// ---------------------------------------------------------------------------

/** Machine-readable reason a route produced no AI output. */
export type AiUnavailable = "no_credit" | "no_key" | "rate_limited" | "failed";

/** Classify an SDK/API error into something the UI can act on. */
export function aiFailureKind(err: unknown): AiUnavailable {
  if (!process.env.ANTHROPIC_API_KEY) return "no_key";
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (msg.includes("credit balance") || msg.includes("billing")) return "no_credit";
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limited";
  if (msg.includes("authentication") || msg.includes("invalid x-api-key")) return "no_key";
  return "failed";
}

/** One sentence a user can act on, per failure kind. */
export const AI_UNAVAILABLE_COPY: Record<AiUnavailable, string> = {
  no_credit:
    "AI features are paused — the Anthropic account is out of credit. Add credit in Plans & Billing and this resumes immediately.",
  no_key: "AI features aren't configured on the server yet.",
  rate_limited: "The AI is rate limited right now. Try again in a moment.",
  failed: "The AI couldn't be reached right now. Try again in a moment.",
};
