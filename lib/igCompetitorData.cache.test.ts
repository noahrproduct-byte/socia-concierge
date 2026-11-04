import { describe, expect, it } from "vitest";
import { hasViewsField } from "./igCompetitorData";

describe("cached competitor rows", () => {
  it("are read again when their posts were saved before views existed", () => {
    expect(hasViewsField([{ likes: 5, comments: 1 }])).toBe(false);
  });
  it("are kept when every post carries views, even when Meta returned none", () => {
    expect(hasViewsField([{ likes: 5, views: 900 }, { likes: 2, views: null }])).toBe(true);
  });
  it("are kept when there are no posts to look at", () => {
    expect(hasViewsField([])).toBe(true);
    expect(hasViewsField(null)).toBe(true);
  });
});
