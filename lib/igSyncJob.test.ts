import { describe, expect, it } from "vitest";
import { dueAccounts, type SyncRow } from "./igSyncJob";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const row = (over: Partial<SyncRow>): SyncRow => ({ user_id: "u1", workspace_id: "w1", ig_user_id: "ig1", is_active: true, access_token: "t", plan_suspended_at: null, last_synced_at: ago(45), ...over });

describe("dueAccounts", () => {
  it("picks accounts older than 30 minutes, never-synced and oldest first", () => {
    const due = dueAccounts([
      row({ workspace_id: "fresh", last_synced_at: ago(10) }),
      row({ workspace_id: "old", last_synced_at: ago(120) }),
      row({ workspace_id: "new", last_synced_at: null }),
      row({ workspace_id: "due", last_synced_at: ago(31) }),
    ], NOW);
    expect(due.map((r) => r.workspace_id)).toEqual(["new", "old", "due"]);
  });

  it("skips paused, disconnected and non-active accounts", () => {
    const due = dueAccounts([
      row({ workspace_id: "paused", plan_suspended_at: ago(1000) }),
      row({ workspace_id: "no-token", access_token: null }),
      row({ workspace_id: "other-account", is_active: false }),
      row({ workspace_id: "pre-workspaces", is_active: null }),
    ], NOW);
    expect(due.map((r) => r.workspace_id)).toEqual(["pre-workspaces"]);
  });

  it("syncs each workspace once", () => {
    const due = dueAccounts([row({ ig_user_id: "a", last_synced_at: ago(90) }), row({ ig_user_id: "b", last_synced_at: ago(60) })], NOW);
    expect(due).toHaveLength(1);
    expect(due[0].ig_user_id).toBe("a");
  });
});
