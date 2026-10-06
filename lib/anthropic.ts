import Anthropic from "@anthropic-ai/sdk";

// Zero-arg constructor reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

// Opus 5 is the default; the deliverable quality is the whole product, so we
// don't downgrade for cost here. Override with ANTHROPIC_MODEL if needed.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// A cheaper, faster model for high-volume, well-bounded work (per-clip
// summaries in Build from Clips). Override with ANTHROPIC_MODEL_FAST.
export const FAST_MODEL = process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-5-5";

/**
 * Which model a task runs on. Each Build-from-Clips pass has its own
 * environment override so quality vs cost can be tested per pass without a
 * deploy of new code:
 *   studio_clip   per-clip card (pass 1)      ANTHROPIC_MODEL_STUDIO_CLIP   default: fast
 *   studio_batch  batch reasoning (pass 2)    ANTHROPIC_MODEL_STUDIO_BATCH  default: MODEL
 *   studio_edl    EDL + edit guide (pass 3)   ANTHROPIC_MODEL_STUDIO_EDL    default: fast
 * The EDL pass defaults to the fast model because its output is validated and
 * snapped deterministically afterwards (lib/studioClips/edl.ts).
 */
export type ModelTask = "default" | "fast" | "studio_clip" | "studio_batch" | "studio_edl";
export function modelFor(task: ModelTask): string {
  switch (task) {
    case "fast": return FAST_MODEL;
    case "studio_clip": return process.env.ANTHROPIC_MODEL_STUDIO_CLIP || FAST_MODEL;
    case "studio_batch": return process.env.ANTHROPIC_MODEL_STUDIO_BATCH || MODEL;
    case "studio_edl": return process.env.ANTHROPIC_MODEL_STUDIO_EDL || FAST_MODEL;
    default: return MODEL;
  }
}

// Availability helpers live in lib/aiStatus.ts — free of this SDK import, so
// client components can render an AI state without bundling the SDK (its
// constructor throws in a browser).
export { aiFailureKind, AI_UNAVAILABLE_COPY, type AiUnavailable } from "./aiStatus";
