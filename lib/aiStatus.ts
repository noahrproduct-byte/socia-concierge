// AI availability — the browser-safe half.
//
// Deliberately free of any SDK import. lib/anthropic.ts constructs the
// Anthropic client at module scope, which throws in a browser, so anything a
// client component needs to render an AI state lives here instead. Importing
// this from a "use client" file must never pull the SDK into the bundle.

/** Machine-readable reason a route produced no AI output. */
export type AiUnavailable = "no_credit" | "no_key" | "rate_limited" | "failed";

/** One sentence a user can act on, per failure kind. */
export const AI_UNAVAILABLE_COPY: Record<AiUnavailable, string> = {
  no_credit:
    "AI features are paused: the Anthropic account is out of credit. Add credit in Plans & Billing and this resumes immediately.",
  no_key: "AI features aren't configured on the server yet.",
  rate_limited: "The AI is rate limited right now. Try again in a moment.",
  failed: "The AI couldn't be reached right now. Try again in a moment.",
};

/** Classify an SDK/API error into something the UI can act on.
 *  Server-side only in practice, but SDK-free so it is safe to share. */
export function aiFailureKind(err: unknown): AiUnavailable {
  if (!process.env.ANTHROPIC_API_KEY) return "no_key";
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (msg.includes("credit balance") || msg.includes("billing")) return "no_credit";
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limited";
  if (msg.includes("authentication") || msg.includes("invalid x-api-key")) return "no_key";
  return "failed";
}
