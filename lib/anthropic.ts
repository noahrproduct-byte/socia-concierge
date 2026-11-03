import Anthropic from "@anthropic-ai/sdk";

// Zero-arg constructor reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

/** The most output a retried call may ask for. */
export const RETRY_MAX_TOKENS = 32_000;

/**
 * Thinking can't be turned off on the 5 family and it shares max_tokens with
 * the answer, so a call with a tight budget can stop mid-answer (stop_reason
 * "max_tokens"): unreadable JSON, half a caption. Every non-streaming call
 * through this client is therefore asked once more with 2.5x the room when
 * that happens. The returned usage adds both calls, so cost records stay true.
 */
export function retryOnMaxTokens(client: Anthropic): void {
  const messages = client.messages;
  const raw = messages.create.bind(messages);
  // Not an async function: a streaming call must get the SDK's own reply
  // object back untouched, because messages.stream() calls .withResponse() on
  // it (an async wrapper turned it into a plain Promise and broke Ask SOCIA).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messages as any).create = (params: any, options?: any) => {
    if (params?.stream) return raw(params, options);
    return retried(params, options);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retried = async (params: any, options?: any) => {
    const first = await raw(params, options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = first as any;
    const budget = Number(params?.max_tokens) || 0;
    if (res?.stop_reason !== "max_tokens" || !budget || budget >= RETRY_MAX_TOKENS) return first;
    const more = Math.min(RETRY_MAX_TOKENS, Math.round(budget * 2.5));
    console.warn(`[anthropic] answer cut off at ${budget} tokens (${params.model}); asking again with ${more}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = (await raw({ ...params, max_tokens: more }, options)) as any;
    const sum = (k: string) => (Number(res.usage?.[k]) || 0) + (Number(second.usage?.[k]) || 0);
    if (second?.usage) second.usage = { ...second.usage, input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens") };
    return second;
  };
}
retryOnMaxTokens(anthropic);

// Opus 5.5 is the default: it succeeds Opus 5 at a lower price. The
// deliverable quality is the whole product, so we don't downgrade for cost
// here. Override with ANTHROPIC_MODEL if needed.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
/**
 * `output_config.effort` for a call on `model`, to spread into output_config.
 * Opus 5.5 defaults to "medium" where Opus 5 ran at "high"; SOCIA keeps "high"
 * unless a call asks for less. Effort is how much the model thinks (thinking
 * can't be turned off on Opus 5.5). Models before the 5 family may not take
 * effort, so an override to one of them gets nothing.
 */
export function effortFor(model: string, effort: Effort = "high"): { effort?: Effort } {
  return /^claude-(opus|sonnet|haiku|fable)-5/.test(model) ? { effort } : {};
}

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
 *   caption       Generate Caption (composer) ANTHROPIC_MODEL_CAPTION       default: MODEL
 *   ask           Ask SOCIA answers           ANTHROPIC_MODEL_ASK           default: fast (Noah, 2026-11-02: speed first)
 * The EDL pass defaults to the fast model because its output is validated and
 * snapped deterministically afterwards (lib/studioClips/edl.ts).
 */
export type ModelTask = "default" | "fast" | "studio_clip" | "studio_batch" | "studio_edl" | "caption" | "ask";
export function modelFor(task: ModelTask): string {
  switch (task) {
    case "fast": return FAST_MODEL;
    case "studio_clip": return process.env.ANTHROPIC_MODEL_STUDIO_CLIP || FAST_MODEL;
    case "studio_batch": return process.env.ANTHROPIC_MODEL_STUDIO_BATCH || MODEL;
    case "studio_edl": return process.env.ANTHROPIC_MODEL_STUDIO_EDL || FAST_MODEL;
    case "caption": return process.env.ANTHROPIC_MODEL_CAPTION || MODEL;
    case "ask": return process.env.ANTHROPIC_MODEL_ASK || FAST_MODEL;
    default: return MODEL;
  }
}

// Availability helpers live in lib/aiStatus.ts — free of this SDK import, so
// client components can render an AI state without bundling the SDK (its
// constructor throws in a browser).
export { aiFailureKind, AI_UNAVAILABLE_COPY, type AiUnavailable } from "./aiStatus";
