import { describe, it, expect } from "vitest";
import { collabItem, mergeCollab } from "./igCollab";
import { postCards } from "./overview";

describe("collab posts this account joined", () => {
  it("keeps who posted it and only the numbers Instagram returned", () => {
    const m = collabItem({ id: "c1", username: "salvospizza", media_type: "VIDEO", media_product_type: "REELS", like_count: 40, comments_count: 3, total_views_count: 5200, saved_count: 7, timestamp: "2026-10-10T12:00:00+0000" });
    expect(m).toMatchObject({ id: "c1", collab_owner: "salvospizza", like_count: 40, comments_count: 3, insights: { views: 5200, saved: 7 } });
    expect(m!.insights).not.toHaveProperty("shares");
    expect(m!.insights).not.toHaveProperty("reach");
    expect(collabItem({ id: "c2" })).not.toHaveProperty("insights");
    expect(collabItem({ caption: "no id" })).toBeNull();
  });

  it("merges newest first and never lists a post twice", () => {
    const own = [{ id: "a", timestamp: "2026-10-12T00:00:00Z" }, { id: "b", timestamp: "2026-10-01T00:00:00Z" }];
    const merged = mergeCollab(own, [{ id: "c", timestamp: "2026-10-05T00:00:00Z", collab_owner: "x" }, { id: "a", timestamp: "2026-10-12T00:00:00Z", collab_owner: "x" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "c", "b"]);
    expect(merged.find((m) => m.id === "a")!.collab_owner).toBeUndefined();
    expect(mergeCollab(own, [])).toBe(own);
  });

  it("shows up in Analytics with who posted it", () => {
    const cards = postCards([{ id: "c", timestamp: "2026-10-05T00:00:00Z", caption: "Pizza night", like_count: 10, collab_owner: "salvospizza" }, { id: "o", timestamp: "2026-10-04T00:00:00Z", caption: "Ours", like_count: 5 }], 5);
    expect(cards[0]).toMatchObject({ id: "c", collabWith: "salvospizza", reach: null });
    expect(cards[1]).not.toHaveProperty("collabWith");
  });
});
