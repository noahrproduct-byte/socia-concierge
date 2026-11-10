import { describe, it, expect, vi, beforeEach } from "vitest";

// A generation job only moves on while it is open, and its credits come back only for the failure that closed it.
const refund = vi.fn(async () => 0);
let updates: { patch: Record<string, unknown>; filters: [string, string, unknown][] }[] = [];
let answer: (patch: Record<string, unknown>) => unknown = (patch) => ({ id: "g1", ...patch });
let stored: unknown = null;

function chain(patch: Record<string, unknown> | null) {
  const filters: [string, string, unknown][] = [];
  if (patch) updates.push({ patch, filters });
  const done = async () => ({ data: patch ? answer(patch) : stored, error: null });
  const q: Record<string, unknown> = {
    eq: (k: string, v: unknown) => { filters.push(["eq", k, v]); return q; },
    in: (k: string, v: unknown) => { filters.push(["in", k, v]); return q; },
    select: () => q,
    single: done, maybeSingle: done,
  };
  return q;
}
const svc = { from: () => ({ update: (patch: Record<string, unknown>) => chain(patch), select: () => chain(null) }) };

const submit = vi.fn(async () => ({ providerRequestId: "r1", statusUrl: null }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => svc, serviceConfigured: () => true }));
vi.mock("@/lib/credits/ledger", () => ({ refundCredits: refund, spendCredits: vi.fn() }));
vi.mock("./higgsfield", () => ({ generationProvider: () => ({ name: "higgsfield", submit, status: vi.fn(), cancel: vi.fn() }) }));

const { submitGenerationJob, applyGenerationStatus, cleanIdea } = await import("./server");
const base = {
  id: "g1", user_id: "u1", workspace_id: null, kind: "text_to_video", model: "hailuo-2.3-standard", prompt: "a cafe at dawn",
  input_image_path: null, input: { durationSec: 6 }, idea: null, provider: "higgsfield", provider_request_id: null,
  credits_reserved: 14, credits_charged: null, error: null, created_at: new Date().toISOString(), updated_at: "", last_polled_at: null, finished_at: null,
} as never as Parameters<typeof submitGenerationJob>[1];

beforeEach(() => { refund.mockClear(); submit.mockClear(); updates = []; answer = (patch) => ({ id: "g1", ...patch }); stored = null; });

describe("generation jobs", () => {
  it("moves only a job that is still queued to processing", async () => {
    answer = () => null;
    stored = { ...base, status: "failed" };
    const out = await submitGenerationJob(svc, { ...base, status: "queued" });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(updates[0].filters).toContainEqual(["eq", "status", "queued"]);
    expect(out.status).toBe("failed");
  });

  it("refunds a failure only when it closed an open job", async () => {
    await applyGenerationStatus(svc, { ...base, status: "processing", provider_request_id: "r1" }, { status: "failed", error: "no" });
    expect(updates[0].filters).toContainEqual(["in", "status", ["queued", "processing"]]);
    expect(refund).toHaveBeenCalledTimes(1);

    refund.mockClear();
    answer = () => null;
    stored = { ...base, status: "done" };
    const out = await applyGenerationStatus(svc, { ...base, status: "processing", provider_request_id: "r1" }, { status: "failed", error: "no" });
    expect(refund).not.toHaveBeenCalled();
    expect(out.status).toBe("done");
  });
});

describe("the idea a generation came from", () => {
  it("keeps only an idea's own fields, as bounded text", () => {
    const idea = cleanIdea({ id: "i1", hook: { $: "x" }, concept: "A slow pour", shot: "x".repeat(5000), kind: "text_to_video", caption: 5, hashtags: ["cafe", 3, "y".repeat(90)], extra: "z".repeat(1e5) });
    expect(idea).toEqual({ id: "i1", hook: "", concept: "A slow pour", shot: "x".repeat(1200), kind: "text_to_video", caption: "", hashtags: ["cafe", "y".repeat(40)] });
    expect(cleanIdea({ hook: 7 })).toBeNull();
    expect(cleanIdea([{ hook: "a" }])).toBeNull();
    expect(cleanIdea("hook")).toBeNull();
  });
});
