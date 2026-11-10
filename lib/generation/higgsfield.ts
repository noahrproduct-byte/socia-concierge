// Higgsfield (https://docs.higgsfield.ai): text-to-video, image-to-video and
// text-to-image on the models in lib/credits/config.ts. Every request is
// asynchronous: submit, then poll `status_url` (or take the webhook). Outputs
// expire after seven days, so the job runner copies them into SOCIA's bucket.
// Prices come from POST /estimate/{endpoint} with the same body. Server only.
import { GenerationError, type GenerationOutput, type GenerationProvider, type GenerationRequest, type GenerationStatus } from "./provider";

const BASE = "https://api.higgsfield.ai";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The JSON body for a model endpoint. Pure: every model's field names live here. */
export function higgsfieldBody(req: GenerationRequest): Record<string, unknown> {
  const prompt = req.prompt.slice(0, 2500);
  const path = req.model.endpoints[req.kind] ?? "";
  const body: Record<string, unknown> = { prompt };
  if (req.kind === "text_to_image") {
    if (req.aspectRatio) body.aspect_ratio = req.aspectRatio;
    if (path.startsWith("higgsfield-ai/soul/")) body.resolution = "1080p";
    return body;
  }
  body.duration = req.durationSec ?? req.model.durations?.[0] ?? 5;
  if (req.kind === "image_to_video") body.image_url = req.imageUrl;
  // Image to video takes its shape from the start image, so only text to video sends one.
  const shape = req.kind === "text_to_video" && req.aspectRatio ? req.aspectRatio : null;
  if (path.startsWith("bytedance/seedance-")) {
    if (shape) body.aspect_ratio = shape;
    body.resolution = "720p";
    body.generate_audio = true;
  } else if (path.startsWith("kling-video/")) {
    if (shape) body.aspect_ratio = shape;
    body.sound = "on";
  } else if (path.startsWith("minimax/")) {
    body.prompt_optimizer = true;
  }
  return body;
}

/** The dollar amount in an estimate answer ({"usd": "0.094"}), or null. Pure. */
export function parseHiggsfieldEstimate(json: unknown): number | null {
  const v = (json as { usd?: unknown } | null)?.usd;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** HIGGSFIELD_API_KEY, or HF_CREDENTIALS as Higgsfield's own SDK names it: "<key id>:<key secret>". */
export function higgsfieldKey(): string {
  return (process.env.HIGGSFIELD_API_KEY?.trim() || process.env.HF_CREDENTIALS?.trim() || "").replace(/^["']|["']$/g, "");
}

/** What a status (or webhook) answer means. Pure. */
export function parseHiggsfieldStatus(json: unknown): GenerationStatus {
  const j = (json ?? {}) as Record<string, unknown>;
  const status = str(j.status);
  // Webhooks wrap the output in `payload`; the status endpoint puts it at the top.
  const out = (j.payload && typeof j.payload === "object" ? j.payload : j) as Record<string, unknown>;
  if (status === "queued") return { status: "queued" };
  if (status === "in_progress") return { status: "processing" };
  if (status === "completed") {
    const outputs: GenerationOutput[] = [];
    const video = out.video as Record<string, unknown> | undefined;
    if (video && str(video.url)) outputs.push({ kind: "video", url: str(video.url)!, contentType: str(video.content_type) });
    const images = Array.isArray(out.images) ? out.images : [];
    for (const im of images) {
      const r = (im ?? {}) as Record<string, unknown>;
      if (str(r.url)) outputs.push({ kind: "image", url: str(r.url)!, contentType: str(r.content_type) });
    }
    return { status: "done", outputs, expiresAt: str(j.expires_at) };
  }
  if (status === "nsfw") return { status: "failed", error: "The provider's content filter declined this prompt. Nothing was charged.", moderated: true };
  if (status === "failed") return { status: "failed", error: str(j.error) ?? "The generation failed on the provider's side. Nothing was charged." };
  if (status === "canceled" || status === "cancelled") return { status: "failed", error: "The generation was cancelled." };
  return { status: "processing" };
}

export class HiggsfieldProvider implements GenerationProvider {
  readonly name = "higgsfield";
  constructor(private key = higgsfieldKey(), private fetchImpl: typeof fetch = fetch) {}

  /** A "<key id>:<key secret>" pair from console.higgsfield.ai is set (see higgsfieldKey). */
  static configured(): boolean {
    return /^[^:\s]+:[^:\s]+$/.test(higgsfieldKey());
  }

  private async call(url: string, init: RequestInit = {}): Promise<{ status: number; json: unknown }> {
    if (!this.key) throw new GenerationError("AI Studio's generation service is not configured.", "not_configured");
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Key ${this.key}`, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const j = (json ?? {}) as Record<string, unknown>;
      const detail = str(j.detail) ?? str(j.error) ?? str(j.message);
      const retry = res.status === 429 || res.status >= 500;
      if (res.status === 402) throw new GenerationError("SOCIA's generation balance is empty. Contact us and we'll sort it out.", "provider_balance");
      throw new GenerationError(retry ? "The generation service is busy. Try again in a few minutes." : `The generation service refused the request${detail ? `: ${detail}` : "."}`, `http_${res.status}`, retry);
    }
    return { status: res.status, json };
  }

  async submit(req: GenerationRequest): Promise<{ providerRequestId: string; statusUrl: string | null }> {
    const path = req.model.endpoints[req.kind];
    if (!path) throw new GenerationError("That model does not do this kind of generation.", "bad_model");
    const url = new URL(`${BASE}/${path}`);
    if (req.webhookUrl) url.searchParams.set("hf_webhook", req.webhookUrl);
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;
    const { json } = await this.call(url.toString(), { method: "POST", headers, body: JSON.stringify(higgsfieldBody(req)) });
    const j = (json ?? {}) as Record<string, unknown>;
    const id = str(j.request_id);
    if (!id) throw new GenerationError("The generation service did not return a request id.", "no_request_id");
    return { providerRequestId: id, statusUrl: str(j.status_url) };
  }

  /** What this exact request would cost SOCIA in dollars, without running it. */
  async estimate(req: GenerationRequest): Promise<number> {
    const path = req.model.endpoints[req.kind];
    if (!path) throw new GenerationError("That model does not do this kind of generation.", "bad_model");
    const { json } = await this.call(`${BASE}/estimate/${path}`, { method: "POST", body: JSON.stringify(higgsfieldBody(req)) });
    const usd = parseHiggsfieldEstimate(json);
    if (usd == null) throw new GenerationError("The generation service did not return a price. Try again in a moment.", "no_estimate", true);
    return usd;
  }

  async status(providerRequestId: string, statusUrl?: string | null): Promise<GenerationStatus> {
    const url = statusUrl ?? `${BASE}/requests/${encodeURIComponent(providerRequestId)}/status`;
    const { json } = await this.call(url);
    return parseHiggsfieldStatus(json);
  }

  async cancel(providerRequestId: string): Promise<boolean> {
    try {
      const { status } = await this.call(`${BASE}/requests/${encodeURIComponent(providerRequestId)}/cancel`, { method: "POST" });
      return status === 202;
    } catch {
      return false;
    }
  }

  async uploadUrl(contentType: string): Promise<{ uploadUrl: string; publicUrl: string; headers: Record<string, string> }> {
    const { json } = await this.call(`${BASE}/files/generate-upload-url`, { method: "POST", body: JSON.stringify({ content_type: contentType }) });
    const j = (json ?? {}) as Record<string, unknown>;
    const uploadUrl = str(j.upload_url);
    const publicUrl = str(j.public_url);
    if (!uploadUrl || !publicUrl) throw new GenerationError("The generation service did not give an upload address.", "no_upload_url");
    const headers: Record<string, string> = {};
    const h = (j.upload_headers ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(h)) if (typeof v === "string") headers[k] = v;
    return { uploadUrl, publicUrl, headers };
  }
}

/** The configured provider, or null when no key is set. One place to swap providers. */
export function generationProvider(): GenerationProvider | null {
  return HiggsfieldProvider.configured() ? new HiggsfieldProvider() : null;
}
