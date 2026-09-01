import Anthropic from "@anthropic-ai/sdk";

// Zero-arg constructor reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

// Opus 5 is the default; the deliverable quality is the whole product, so we
// don't downgrade for cost here. Override with ANTHROPIC_MODEL if needed.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// Availability helpers live in lib/aiStatus.ts — free of this SDK import, so
// client components can render an AI state without bundling the SDK (its
// constructor throws in a browser).
export { aiFailureKind, AI_UNAVAILABLE_COPY, type AiUnavailable } from "./aiStatus";
