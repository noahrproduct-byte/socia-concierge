import { after } from "next/server";
import { trackEvent } from "./events";
import { addSpend, claudeMicros, musicMicros, transcriptionMicros } from "./aiSpend";

// What each AI call actually cost, from the response's own usage numbers, so
// plan allowances can be set from real data instead of estimates. One
// product_events row per call (name "ai_usage"), under the workspace owner
// whose plan pays for it. Never fails the request it describes.

export type AiFeature =
  | "ask" | "rate" | "caption" | "studio_analyze" | "studio_improve"
  | "niche_analyze" | "niche_opportunity" | "niche_formats" | "growth_strategy" | "content_guide" | "account_audit" | "niche_describe"
  | "competitor_research" | "content_plan" | "comment_reply"
  | "clip_card" | "clip_batch" | "clip_edl" | "transcribe" | "music_playlist" | "video_ideas" | "place_scan"
  | "clipper_captions" | "clipper_pick" | "clipper_frame" | "studio_ideas" | "brief_enhance" | "animated_script" | "animated_fit" | "animated_pick" | "animated_plan";

type Usage = {
  input_tokens?: number; output_tokens?: number;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
};

/** The props stored for one response. Pure; null when the response carries no usage. */
export function usageProps(feature: AiFeature, res: unknown): Record<string, unknown> | null {
  const r = res as { model?: string; usage?: Usage } | null;
  const u = r?.usage;
  if (!u) return null;
  return {
    feature,
    model: r?.model ?? null,
    input_tokens: u.input_tokens ?? null,
    output_tokens: u.output_tokens ?? null,
    cache_read_input_tokens: u.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
    web_search_requests: u.server_tool_use?.web_search_requests ?? null,
  };
}

function write(ownerId: string | null | undefined, props: Record<string, unknown>, micros = 0): void {
  if (!ownerId) return;
  // The cost also goes into the owner's month (lib/aiSpend.ts), which every
  // later AI action checks against the plan's ceiling.
  try {
    after(() => Promise.all([trackEvent(null, ownerId, "ai_usage", props), addSpend(ownerId, micros)]));
  } catch {
    // Outside a request scope (jobs, tests): fire and forget.
    void trackEvent(null, ownerId, "ai_usage", props);
    void addSpend(ownerId, micros);
  }
}

/** Record one Claude response's token usage for the owner who pays for it. */
export function recordAiUsage(ownerId: string | null | undefined, feature: AiFeature, res: unknown): void {
  const props = usageProps(feature, res);
  const r = res as { model?: string; usage?: Parameters<typeof claudeMicros>[1] } | null;
  if (props) write(ownerId, props, claudeMicros(r?.model, r?.usage));
}

/** Record seconds of audio sent for transcription (billed by audio length). */
export function recordTranscription(ownerId: string | null | undefined, purpose: string, seconds: number): void {
  if (!(seconds > 0)) return;
  write(ownerId, { feature: "transcribe", purpose, provider: "assemblyai", audio_seconds: Math.round(seconds) }, transcriptionMicros(seconds));
}

/** Record seconds of music generated (ElevenLabs, billed by length). */
export function recordMusic(ownerId: string | null | undefined, seconds: number): void {
  if (!(seconds > 0)) return;
  write(ownerId, { feature: "music_track", provider: "elevenlabs", audio_seconds: Math.round(seconds) }, musicMicros(seconds));
}
