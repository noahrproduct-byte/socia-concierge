// The AI generation provider behind AI Studio. Routes and the UI only know
// this interface; Higgsfield (lib/generation/higgsfield.ts) is the first
// provider. Client-safe types; providers are server only.
import type { GenerationKind, GenerationModel } from "@/lib/credits/config";

export type GenerationRequest = {
  kind: GenerationKind;
  model: GenerationModel;
  prompt: string;
  /** Video length in seconds (video kinds). */
  durationSec?: number;
  aspectRatio?: string;
  /** A public image URL the provider can fetch (image_to_video). */
  imageUrl?: string;
  /** Where the provider should POST when it finishes. */
  webhookUrl?: string;
  /** Repeated submissions with the same key are one request. */
  idempotencyKey?: string;
};

export type GenerationOutput = { kind: "video" | "image"; url: string; contentType?: string | null };

export type GenerationStatus =
  | { status: "queued" | "processing" }
  | { status: "done"; outputs: GenerationOutput[]; expiresAt?: string | null }
  | { status: "failed"; error: string; moderated?: boolean };

export interface GenerationProvider {
  readonly name: string;
  submit(req: GenerationRequest): Promise<{ providerRequestId: string; statusUrl: string | null }>;
  status(providerRequestId: string, statusUrl?: string | null): Promise<GenerationStatus>;
  cancel(providerRequestId: string): Promise<boolean>;
  /** A place to PUT an input file the provider can then read. */
  uploadUrl(contentType: string): Promise<{ uploadUrl: string; publicUrl: string; headers: Record<string, string> }>;
}

export class GenerationError extends Error {
  constructor(message: string, public code: string = "provider_error", public retryable = false) {
    super(message);
  }
}
