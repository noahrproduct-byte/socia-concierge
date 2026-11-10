import { describe, it, expect, vi, beforeEach } from "vitest";

// A job cancelled: credits back once (less the work already paid for), upload gone, and a pick still running can't bring it back.
const refund = vi.fn(async () => 0);
const spend = vi.fn(async (..._args: unknown[]) => 0);
const removed: unknown[][] = [];
let updates: { table: string; patch: Record<string, unknown>; filters: [string, string, unknown][] }[] = [];
let deletes: { table: string; filters: [string, string, unknown][] }[] = [];
let answer: (table: string, patch: Record<string, unknown>) => unknown = (_t, patch) => ({ id: "j1", ...patch });
// What a plain read returns (a job re-read after an update that matched nothing, or a transcript).
const TRANSCRIPT = { transcript: [["one", 0, 100], ["two", 200, 300], ["three.", 400, 500]] };
let reads: (table: string, filters: [string, string, unknown][]) => unknown = () => TRANSCRIPT;
const selects: { table: string; filters: [string, string, unknown][] }[] = [];

function chain(table: string, patch: Record<string, unknown> | null, isDelete = false) {
  const filters: [string, string, unknown][] = [];
  const rec = { table, patch: patch ?? {}, filters };
  if (patch) updates.push(rec);
  if (isDelete) deletes.push({ table, filters });
  if (!patch && !isDelete) selects.push({ table, filters });
  const done = async () => ({ data: patch ? answer(table, patch) : reads(table, filters), error: null });
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
vi.mock("@/lib/credits/ledger", () => ({ refundCredits: refund, spendCredits: spend, CreditsError: class extends Error {} }));
const startTranscription = vi.fn(async () => "t9");
vi.mock("./socia", () => ({
  SOCIA_PROVIDER: "socia", sociaClipperReady: () => true, startTranscription, checkTranscription: vi.fn(),
  pickMoments: async () => ({ picks: [{ startMs: 0, endMs: 500, title: "T", hook: "", score: 5, reason: "", text: "one two three." }], brand: "" }),
  clipRows: async () => [{ job_id: "j1", provider_clip_id: "socia-1" }],
}));

const { cancelClipJob, pollClipJob, loadClipJob } = await import("./server");
const base = { id: "j1", user_id: "u1", workspace_id: null, source_kind: "upload", source_url: "x", source_path: "u1/clipper-sources/a.mp4", source_minutes: 5, options: {}, provider: "socia", provider_job_id: "t1", credits_reserved: 23, credits_charged: null, error: null, created_at: new Date().toISOString(), updated_at: "", last_polled_at: null, finished_at: null } as never as Parameters<typeof cancelClipJob>[0];

beforeEach(() => { refund.mockClear(); spend.mockClear(); startTranscription.mockClear(); removed.length = 0; updates = []; deletes = []; selects.length = 0; answer = (_t, patch) => ({ id: "j1", ...patch }); reads = () => TRANSCRIPT; });

describe("cancelling a clip job", () => {
  it("stops a job that hasn't been sent anywhere, gives every credit back and deletes the upload", async () => {
    const out = await cancelClipJob({ ...base, status: "queued", stage: null, provider_job_id: null });
    expect(out).toMatchObject({ status: "cancelled", credits_charged: 0 });
    expect(updates[0].filters).toContainEqual(["in", "status", ["queued", "processing"]]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(spend).not.toHaveBeenCalled();
    expect(removed).toEqual([["u1/clipper-sources/a.mp4"]]);
  });

  it("keeps what the transcription cost once the video was sent, and gives the rest back", async () => {
    const out = await cancelClipJob({ ...base, status: "processing", stage: "transcribing" });
    // 5 minutes at $0.0035 a minute, at the 1.5 margin: 3 credits of 23.
    expect(out).toMatchObject({ status: "cancelled", credits_charged: 3 });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledWith("u1", 3, { kind: "clip_job", id: "j1:kept" }, expect.any(String));
    expect(removed).toEqual([["u1/clipper-sources/a.mp4"]]);
  });

  it("keeps the whole price once the moments are being picked", async () => {
    const out = await cancelClipJob({ ...base, status: "processing", stage: "picking-run" });
    expect(out).toMatchObject({ status: "cancelled", credits_charged: 23 });
    expect(spend).toHaveBeenCalledWith("u1", 23, { kind: "clip_job", id: "j1:kept" }, expect.any(String));
  });

  it("doesn't take the kept part when the refund itself didn't go through", async () => {
    refund.mockResolvedValueOnce(null as never);
    await cancelClipJob({ ...base, status: "processing", stage: "transcribing" });
    expect(spend).not.toHaveBeenCalled();
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

  it("keeps a job cancelled while it was being sent on: it doesn't start running again", async () => {
    answer = (_t, patch) => (patch.status === "processing" ? null : { id: "j1", ...patch });
    reads = (table) => (table === "clip_jobs" ? { ...base, status: "cancelled", stage: null } : TRANSCRIPT);
    const out = await pollClipJob(svc, { ...base, status: "queued", provider_job_id: null });
    expect(startTranscription).toHaveBeenCalledTimes(1);
    const moved = updates.find((u) => u.patch.status === "processing")!;
    expect(moved.filters).toContainEqual(["eq", "status", "queued"]);
    expect(out.status).toBe("cancelled");
  });

  it("gives nothing back when a job that is failed late had already finished", async () => {
    answer = (_t, patch) => (patch.status === "failed" ? null : { id: "j1", ...patch });
    reads = (table) => (table === "clip_jobs" ? { ...base, status: "done" } : TRANSCRIPT);
    const old = new Date(Date.now() - 7 * 3600_000).toISOString();
    const out = await pollClipJob(svc, { ...base, status: "processing", stage: "transcribing", created_at: old });
    expect(updates.find((u) => u.patch.status === "failed")?.filters).toContainEqual(["in", "status", ["queued", "processing"]]);
    expect(refund).not.toHaveBeenCalled();
    expect(out.status).toBe("done");
  });
});

describe("loading one clip job", () => {
  it("looks only in the active Brand Workspace, and not at all for an id that isn't one", async () => {
    reads = () => null;
    await loadClipJob(svc, "u1", "ws1", "6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e");
    expect(selects.at(-1)?.filters).toEqual(expect.arrayContaining([["eq", "user_id", "u1"], ["eq", "workspace_id", "ws1"]]));
    const before = selects.length;
    expect(await loadClipJob(svc, "u1", "ws1", "not-an-id")).toBeNull();
    expect(selects.length).toBe(before);
  });
});

describe("a clip job that fails", () => {
  it("keeps the transcription's cost when the transcription finished but heard too little speech", async () => {
    const socia = await import("./socia");
    vi.mocked(socia.checkTranscription).mockResolvedValueOnce({ status: "failed", error: "too little speech", billed: true });
    const out = await pollClipJob(svc, { ...base, status: "processing", stage: "transcribing" });
    expect(out).toMatchObject({ status: "failed", credits_charged: 3 });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledWith("u1", 3, { kind: "clip_job", id: "j1:kept" }, expect.any(String));
  });

  it("gives everything back when the transcription service itself failed", async () => {
    const socia = await import("./socia");
    vi.mocked(socia.checkTranscription).mockResolvedValueOnce({ status: "failed", error: "couldn't be transcribed" });
    const out = await pollClipJob(svc, { ...base, status: "processing", stage: "transcribing" });
    expect(out).toMatchObject({ status: "failed", credits_charged: 0 });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(spend).not.toHaveBeenCalled();
  });
});
