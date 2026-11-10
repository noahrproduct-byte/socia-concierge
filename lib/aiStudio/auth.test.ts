import { describe, expect, it, vi } from "vitest";
import { APIError } from "@anthropic-ai/sdk";

// What the AI Clipper and AI Studio routes say when something throws: SOCIA's
// own sentences pass through; database, credits and AI service details stay in the log.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/context", () => ({ resolveContext: vi.fn(), can: vi.fn(), forbiddenCopy: () => "" }));
vi.mock("@/lib/planGuard", () => ({ requireFeature: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { aiErrorResponse } = await import("./auth");
const { ClipperError } = await import("@/lib/clipper/provider");
const { GenerationError } = await import("@/lib/generation/provider");
const { CreditsError } = await import("@/lib/credits/ledger");

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as { error: string; code?: string } });

describe("aiErrorResponse", () => {
  it("keeps the person's own messages", async () => {
    const r = await read(aiErrorResponse("t", new ClipperError("Paste a YouTube video link.", "bad_link")));
    expect(r).toMatchObject({ status: 400, body: { error: "Paste a YouTube video link." } });
    const c = await read(aiErrorResponse("t", new CreditsError("insufficient_credits", "short", 3)));
    expect(c.status).toBe(402);
  });

  it("never passes on a database message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const e of [
      new ClipperError('invalid input syntax for type uuid: "x" on clip_jobs', "db"),
      new GenerationError('duplicate key value violates unique constraint "generations_pkey"', "db"),
      new CreditsError("unavailable", "Credits could not be spent: permission denied for function socia_credit_spend"),
      Object.assign(new Error("Object not found in bucket ai-media"), { __isStorageError: true, status: 404 }),
    ]) {
      const r = await read(aiErrorResponse("t", e));
      expect(r.body.error).not.toMatch(/uuid|clip_jobs|constraint|generations_pkey|socia_credit|permission|bucket|ai-media/i);
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("answers an AI service error with the usual sentence, not the service's details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new APIError(400, { type: "error", error: { type: "invalid_request_error", message: "messages.0.content.1.image.source.base64: invalid" } }, undefined, new Headers());
    const r = await read(aiErrorResponse("t", e));
    expect(r.status).toBe(502);
    expect(r.body.error).not.toMatch(/base64|invalid_request_error|messages\.0/);
  });
});
