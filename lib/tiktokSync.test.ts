import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { user_id: string; workspace_id: string | null; open_id: string | null; access_token: string | null; last_synced_at: string | null; plan_suspended_at: string | null };
const synced: { userId: string; workspaceId: string | null }[] = [];
const snapshots: { row: Record<string, unknown>; metrics: Record<string, unknown> }[] = [];
let results: Record<string, { profile: { openId: string; followers: number | null } | null; videos: unknown[] | null }> = {};

vi.mock("./tiktokData", () => ({
  syncTikTok: async (_s: unknown, userId: string, workspaceId: string | null) => {
    synced.push({ userId, workspaceId });
    return results[userId] ?? { profile: null, videos: null };
  },
}));
vi.mock("./platformSnapshots", () => ({
  writePlatformSnapshot: async (_s: unknown, row: Record<string, unknown>, metrics: Record<string, unknown>) => {
    snapshots.push({ row, metrics });
    return true;
  },
}));

import { runTikTokDailySync } from "./tiktokSync";

const NOW = new Date("2026-10-29T06:00:00Z");
const supa = (rows: Row[]) => ({ from: () => ({ select: async () => ({ data: rows, error: null }) }) });
const row = (over: Partial<Row>): Row => ({ user_id: "u1", workspace_id: "w1", open_id: "o1", access_token: "t", last_synced_at: null, plan_suspended_at: null, ...over });

beforeEach(() => {
  synced.length = 0;
  snapshots.length = 0;
  results = {};
});

describe("runTikTokDailySync", () => {
  it("refreshes each account in its own workspace and records the follower point", async () => {
    results = { u1: { profile: { openId: "o1", followers: 1200 }, videos: [] } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = await runTikTokDailySync(supa([row({})]) as any, NOW);
    expect(synced).toEqual([{ userId: "u1", workspaceId: "w1" }]);
    expect(run).toMatchObject({ accounts: 1, synced: 1, errors: 0 });
    expect(snapshots).toEqual([{ row: { user_id: "u1", workspace_id: "w1", platform: "tiktok", account_id: "o1", day: "2026-10-29" }, metrics: { followers: 1200 } }]);
  });

  it("skips paused, tokenless and recently synced accounts", async () => {
    const rows = [
      row({ user_id: "paused", plan_suspended_at: "2026-10-01T00:00:00Z" }),
      row({ user_id: "notoken", access_token: null }),
      row({ user_id: "fresh", last_synced_at: "2026-10-29T01:00:00Z" }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = await runTikTokDailySync(supa(rows) as any, NOW);
    expect(synced).toEqual([]);
    expect(run).toMatchObject({ accounts: 1, synced: 0, skipped: 1 });
  });

  it("counts a failed read as an error and writes no made-up point", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = await runTikTokDailySync(supa([row({ user_id: "u2" })]) as any, NOW);
    expect(run).toMatchObject({ synced: 0, errors: 1 });
    expect(snapshots).toEqual([]);
  });
});
