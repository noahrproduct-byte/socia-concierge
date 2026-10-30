import { describe, it, expect } from "vitest";
import { brandsFrom, planRun, REFRESH_EVERY_H, type Brand } from "./dailyRun";

const H = 3_600_000;
const now = Date.parse("2026-10-29T12:00:00Z");
const b = (userId: string, workspaceId: string | null, youtube = false): Brand => ({ userId, workspaceId, youtube });
const key = (x: Brand) => `${x.userId}:${x.workspaceId ?? "-"}`;

describe("brandsFrom", () => {
  it("makes one brand per owner and workspace, marking those with YouTube", () => {
    const out = brandsFrom(
      [{ user_id: "u1", workspace_id: "w1" }, { user_id: "u1", workspace_id: "w1" }, { user_id: "u2", workspace_id: null }],
      [{ user_id: "u1", workspace_id: "w1" }, { user_id: "u3", workspace_id: "w3" }],
    );
    expect(out).toHaveLength(3);
    expect(out.find((x) => x.userId === "u1")?.youtube).toBe(true);
    expect(out.find((x) => x.userId === "u2")?.youtube).toBe(false);
    expect(out.find((x) => x.userId === "u3")?.youtube).toBe(true);
  });
});

describe("planRun", () => {
  it("skips brands refreshed within the window and takes the oldest first", () => {
    const brands = [b("fresh", "w"), b("old", "w"), b("never", "w")];
    const last = new Map([[key(brands[0]), now - 2 * H], [key(brands[1]), now - (REFRESH_EVERY_H + 5) * H]]);
    const p = planRun(brands, last, now);
    expect(p.run.map((x) => x.userId)).toEqual(["never", "old"]);
    expect(p.due).toBe(2);
  });

  it("defers brands with YouTube past the run's allowance, whole, and keeps the rest", () => {
    const brands = [b("y1", "a", true), b("y2", "b", true), b("ig", "c"), b("y3", "d", true)];
    const p = planRun(brands, new Map(), now, 2);
    expect(p.run.map((x) => x.userId)).toEqual(["y1", "y2", "ig"]);
    expect(p.deferredYouTube).toBe(1);
  });
});
