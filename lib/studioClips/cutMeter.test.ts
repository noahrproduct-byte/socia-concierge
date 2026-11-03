import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUsage = vi.fn();
vi.mock("@/lib/planGuard", () => ({ requireUsage: (...a: unknown[]) => requireUsage(...a) }));

import { handOverCut } from "./cutMeter";

/** A stand-in for the Supabase client: the counted mark's read, and the update that sets it. */
function fakeClient(opts: { counted?: string | null; missingColumn?: boolean; updated?: number }) {
  const updates: unknown[] = [];
  const chain = (result: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "is", "select"]) q[m] = () => q;
    q.maybeSingle = async () => result();
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
    return q;
  };
  const client = {
    from: () => ({
      select: () => chain(() => (opts.missingColumn ? { data: null, error: { code: "42703", message: 'column "cut_counted_at" does not exist' } } : { data: { cut_counted_at: opts.counted ?? null }, error: null })),
      update: (v: unknown) => { updates.push(v); return chain(() => ({ data: Array.from({ length: opts.updated ?? 1 }, () => ({ id: "b" })), error: null })); },
    }),
  };
  return { client: client as never, updates };
}

const release = vi.fn(async () => {});
beforeEach(() => {
  requireUsage.mockReset();
  release.mockClear();
  requireUsage.mockResolvedValue({ denied: null, usage: { used: 1, limit: 5 }, release });
});

describe("handOverCut: SOCIA's cut counts once, when it reaches the browser", () => {
  it("never counts the person's own edit or a single-clip post", async () => {
    const { client } = fakeClient({});
    for (const idx of [-1, -1000, -1003]) expect(await handOverCut(client, "o", null, { id: "b", opportunity_idx: idx })).toMatchObject({ ok: true, usage: null });
    expect(requireUsage).not.toHaveBeenCalled();
  });

  it("counts a cut the first time and marks it", async () => {
    const { client, updates } = fakeClient({ counted: null });
    expect(await handOverCut(client, "o", "ws", { id: "b", opportunity_idx: 0 })).toMatchObject({ ok: true, tracked: true, usage: { used: 1, limit: 5 } });
    expect(requireUsage).toHaveBeenCalledWith(client, "o", "video_builds", { feature: "auto_build" });
    expect(updates).toHaveLength(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("doesn't count a cut again once it is marked", async () => {
    const { client } = fakeClient({ counted: "2026-11-03T00:00:00Z" });
    expect(await handOverCut(client, "o", null, { id: "b", opportunity_idx: -2 })).toMatchObject({ ok: true, usage: null, tracked: true });
    expect(requireUsage).not.toHaveBeenCalled();
  });

  it("gives the unit back when another request marked it first", async () => {
    const { client } = fakeClient({ counted: null, updated: 0 });
    await handOverCut(client, "o", null, { id: "b", opportunity_idx: 0 });
    expect(release).toHaveBeenCalledOnce();
  });

  it("refuses when the plan has no Make This Video or no videos left", async () => {
    const denied = { status: 402 };
    requireUsage.mockResolvedValue({ denied, usage: null, release });
    const { client, updates } = fakeClient({ counted: null });
    expect(await handOverCut(client, "o", null, { id: "b", opportunity_idx: 0 })).toEqual({ ok: false, res: denied });
    expect(updates).toHaveLength(0);
  });

  it("leaves counting to the export before the migration has run", async () => {
    const { client } = fakeClient({ missingColumn: true });
    expect(await handOverCut(client, "o", null, { id: "b", opportunity_idx: 0 })).toEqual({ ok: true, usage: null, tracked: false });
    expect(requireUsage).not.toHaveBeenCalled();
  });
});
