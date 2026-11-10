import { describe, it, expect, vi } from "vitest";
import { HiggsfieldProvider, higgsfieldBody, parseHiggsfieldEstimate, parseHiggsfieldStatus } from "./higgsfield";
import { modelById } from "@/lib/credits/config";

const kling = modelById("kling-3.0-standard")!;
const hailuo = modelById("hailuo-2.3-standard")!;
const soul = modelById("soul-2-standard")!;
const seedance = modelById("seedance-2.5")!;

describe("higgsfield request body", () => {
  it("uses each model's own fields", () => {
    expect(higgsfieldBody({ kind: "text_to_video", model: kling, prompt: "a cup", durationSec: 8, aspectRatio: "9:16" })).toEqual({ prompt: "a cup", duration: 8, aspect_ratio: "9:16", sound: "on" });
    expect(higgsfieldBody({ kind: "image_to_video", model: kling, prompt: "a cup", durationSec: 5, imageUrl: "https://i/x.jpg", aspectRatio: "9:16" })).toEqual({ prompt: "a cup", duration: 5, image_url: "https://i/x.jpg", sound: "on" });
    expect(higgsfieldBody({ kind: "image_to_video", model: hailuo, prompt: "a cup", durationSec: 6, imageUrl: "https://i/x.jpg", aspectRatio: "9:16" })).toEqual({ prompt: "a cup", duration: 6, image_url: "https://i/x.jpg", prompt_optimizer: true });
    expect(higgsfieldBody({ kind: "text_to_image", model: soul, prompt: "a cup", aspectRatio: "1:1" })).toEqual({ prompt: "a cup", aspect_ratio: "1:1", resolution: "1080p" });
    expect(higgsfieldBody({ kind: "text_to_video", model: seedance, prompt: "a cup", durationSec: 10, aspectRatio: "9:16" })).toEqual({ prompt: "a cup", duration: 10, aspect_ratio: "9:16", resolution: "720p", generate_audio: true });
  });
  it("truncates a long prompt to the provider's limit", () => {
    expect((higgsfieldBody({ kind: "text_to_video", model: kling, prompt: "x".repeat(3000) }).prompt as string).length).toBe(2500);
  });
});

describe("higgsfield estimate", () => {
  it("reads the dollar amount, as a string or a number, and refuses anything else", () => {
    expect(parseHiggsfieldEstimate({ usd: "0.094" })).toBe(0.094);
    expect(parseHiggsfieldEstimate({ usd: 1.5 })).toBe(1.5);
    expect(parseHiggsfieldEstimate({ usd: "n/a" })).toBeNull();
    expect(parseHiggsfieldEstimate({ usd: -1 })).toBeNull();
    expect(parseHiggsfieldEstimate(null)).toBeNull();
  });
  it("asks /estimate/{endpoint} with the same body it would submit", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ usd: "0.75" }), { status: 200 })) as unknown as typeof fetch;
    const p = new HiggsfieldProvider("id:secret", fetchImpl);
    expect(await p.estimate({ kind: "text_to_video", model: seedance, prompt: "a cup", durationSec: 15, aspectRatio: "9:16" })).toBe(0.75);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video");
    expect(JSON.parse(String(init.body))).toEqual({ prompt: "a cup", duration: 15, aspect_ratio: "9:16", resolution: "720p", generate_audio: true });
  });
  it("is retryable when the answer has no price", async () => {
    const p = new HiggsfieldProvider("id:s", (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch);
    await expect(p.estimate({ kind: "text_to_image", model: soul, prompt: "a" })).rejects.toMatchObject({ code: "no_estimate", retryable: true });
  });
});

describe("higgsfield status", () => {
  it("maps every status", () => {
    expect(parseHiggsfieldStatus({ status: "queued" })).toEqual({ status: "queued" });
    expect(parseHiggsfieldStatus({ status: "in_progress" })).toEqual({ status: "processing" });
    expect(parseHiggsfieldStatus({ status: "failed", error: "boom" })).toEqual({ status: "failed", error: "boom" });
    expect(parseHiggsfieldStatus({ status: "nsfw" })).toMatchObject({ status: "failed", moderated: true });
    expect(parseHiggsfieldStatus({ status: "canceled" })).toMatchObject({ status: "failed" });
  });
  it("reads a video from the status endpoint and from a webhook envelope", () => {
    expect(parseHiggsfieldStatus({ status: "completed", request_id: "r", video: { url: "https://o/v.mp4", content_type: "video/mp4" } })).toEqual({ status: "done", outputs: [{ kind: "video", url: "https://o/v.mp4", contentType: "video/mp4" }], expiresAt: null });
    expect(parseHiggsfieldStatus({ status: "completed", request_id: "r", expires_at: "2026-11-11T00:00:00Z", payload: { images: [{ url: "https://o/a.jpg", content_type: "image/jpeg" }] } })).toEqual({ status: "done", outputs: [{ kind: "image", url: "https://o/a.jpg", contentType: "image/jpeg" }], expiresAt: "2026-11-11T00:00:00Z" });
  });
});

describe("HiggsfieldProvider", () => {
  it("submits with the Key header, the webhook query and the idempotency key, and returns the request id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "queued", request_id: "req_1", status_url: "https://api.higgsfield.ai/requests/req_1/status", cancel_url: "c" }), { status: 200 })) as unknown as typeof fetch;
    const p = new HiggsfieldProvider("id:secret", fetchImpl);
    const r = await p.submit({ kind: "text_to_video", model: seedance, prompt: "a cup", durationSec: 5, webhookUrl: "https://sociaos.com/api/webhooks/higgsfield", idempotencyKey: "job-1" });
    expect(r).toEqual({ providerRequestId: "req_1", statusUrl: "https://api.higgsfield.ai/requests/req_1/status" });
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video?hf_webhook=https%3A%2F%2Fsociaos.com%2Fapi%2Fwebhooks%2Fhiggsfield");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Key id:secret");
    expect(h["Idempotency-Key"]).toBe("job-1");
  });
  it("marks a 5xx retryable, a 4xx not, and an empty balance plainly", async () => {
    const p5 = new HiggsfieldProvider("id:s", (async () => new Response("x", { status: 503 })) as unknown as typeof fetch);
    await expect(p5.status("r")).rejects.toMatchObject({ retryable: true });
    const p4 = new HiggsfieldProvider("id:s", (async () => new Response(JSON.stringify({ detail: "bad prompt" }), { status: 422 })) as unknown as typeof fetch);
    await expect(p4.status("r")).rejects.toMatchObject({ retryable: false, code: "http_422" });
    const p402 = new HiggsfieldProvider("id:s", (async () => new Response("", { status: 402 })) as unknown as typeof fetch);
    await expect(p402.status("r")).rejects.toMatchObject({ code: "provider_balance" });
  });
  it("is configured only with an id:secret pair, under either name", () => {
    const keep = { a: process.env.HIGGSFIELD_API_KEY, b: process.env.HF_CREDENTIALS };
    delete process.env.HF_CREDENTIALS;
    process.env.HIGGSFIELD_API_KEY = "only-one-part";
    expect(HiggsfieldProvider.configured()).toBe(false);
    process.env.HIGGSFIELD_API_KEY = "abc:def";
    expect(HiggsfieldProvider.configured()).toBe(true);
    delete process.env.HIGGSFIELD_API_KEY;
    process.env.HF_CREDENTIALS = "abc:def";
    expect(HiggsfieldProvider.configured()).toBe(true);
    for (const [k, v] of [["HIGGSFIELD_API_KEY", keep.a], ["HF_CREDENTIALS", keep.b]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
});
