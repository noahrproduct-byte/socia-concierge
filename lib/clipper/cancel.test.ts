import { describe, it, expect, vi, beforeEach } from "vitest";

// A job cancelled: credits back once, upload gone, and a pick still running can't bring it back.
const refund = vi.fn(async () => 0);
const removed: unknown[][] = [];
let updates: { table: string; patch: Record<string, unknown>; filters: [string, string, unknown][] }[] = [];
let deletes: { table: string; filters: [string, string, unknown][] }[] = [];
let answer: (table: string, patch: Record<string, unknown>) => unknown = (_t, patch) => ({ id: "j1", ...patch });

function chain(table: string, patch: Record<string, unknown> | null, isDelete = false) {
  const filters: [string, string, unknown][] = [];
  const rec = { table, patch: patch ?? {}, filters };
  if (patch) updates.push(rec);
  if (isDelete) deletes.push({ table, filters });
  const done = async () => ({ data: patch ? answer(table, patch) : { transcript: [["one", 0, 100], ["two", 200, 300], ["three.", 400, 500]] }, error: null });
  const q: Record<string, unknown> = {
    eq: (k: string, v: unknown) => { filters.push(["eq", k, v]); return q; },
    in: (k: string, v: unknown) => { filters.push(["in", k, v]); return q; },
    lt: (k: string, v: unknown) => { filters.push(["lt", k, v]); return q; },
    select: () => q,
    single: done, maybeSingle: done,
    then: (res: (v: { data: null; error: null }) => unknown) => res({ data: null, error: null }),
  };
  return q;
}
const svc = {
  from: (table: string) => ({
    update: (patch: Record<string, unknown>) => chain(table, patch),
    delete: () => chain(table, null, true),
    upsert: async () => ({ error: null }),
    select: () => chain(table, null),
  }),
  storage: { from: () => ({ remove: (paths: unknown[]) => { removed.push(paths); return Promise.resolve({}); } }) },
};

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => svc, serviceConfigured: () => true }));
vi.mock("@/lib/credits/ledger", () => ({ refundCredits: refund, spendCredits: vi.fn(), CreditsError: class extends Error {} }));
vi.mock("./socia", () => ({
  SOCIA_PROVIDER: "socia", sociaClipperReady: () => true, startTranscription: vi.fn(), checkTranscription: vi.fn(),
  pickMoments: async () => ({ picks: [{ startMs: 0, endMs: 500, title: "T", hook: "", score: 5, reason: "", text: "one two three." }], brand: "" }),
  clipRows: async () => [{ job_id: "j1", provider_clip_id: "socia-1" }],
}));

const { cancelClipJob, pollClipJob } = await import("./server");
const base = { id: "j1", user_id: "u1", workspace_id: null, source_kind: "upload", source_url: "x", source_path: "u1/clipper-sources/a.mp4", source_minutes: 5, options: {}, provider: "socia", provider_job_id: "t1", credits_reserved: 23, credits_charged: null, error: null, created_at: new Date().toISOString(), updated_at: "", last_polled_at: null, finished_at: null } as never as Parameters<typeof cancelClipJob>[0];

beforeEach(() => { refund.mockClear(); removed.length = 0; updates = []; deletes = []; answer = (_t, patch) => ({ id: "j1", ...patch }); });

describe("cancelling a clip job", () => {
  it("stops a running job, gives the credits back and deletes the upload", async () => {
    const out = await cancelClipJob({ ...base, status: "processing", stage: "transcribing" });
    expect(out).toMatchObject({ status: "cancelled", credits_charged: 0 });
    expect(updates[0].filters).toContainEqual(["in", "status", ["queued", "processing"]]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([["u1/clipper-sources/a.mp4"]]);
  });

  it("refuses a finished job or one already with an outside provider, without touching anything", async () => {
    expect(await cancelClipJob({ ...base, status: "done" })).toBeNull();
    expect(await cancelClipJob({ ...base, status: "failed" })).toBeNull();
    expect(await cancelClipJob({ ...base, status: "processing", provider: "vizard" })).toBeNull();
    expect(updates).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
  });

  it("gives nothing back when the job finished at the same moment", async () => {
    answer = () => null;
    expect(await cancelClipJob({ ...base, status: "processing", stage: "picking-run" })).toBeNull();
    expect(refund).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
  });

  it("drops the clips when a job was cancelled while its moments were being picked", async () => {
    answer = (_t, patch) => (patch.status === "done" ? null : { id: "j1", ...patch, transcript: [["one", 0, 100], ["two", 200, 300], ["three.", 400, 500]] });
    const out = await pollClipJob(svc, { ...base, status: "processing", stage: "picking" });
    expect(out.status).toBe("cancelled");
    const done = updates.find((u) => u.patch.status === "done")!;
    expect(done.filters).toContainEqual(["eq", "status", "processing"]);
    expect(deletes.find((d) => d.table === "clips")?.filters).toContainEqual(["eq", "job_id", "j1"]);
  });
});
