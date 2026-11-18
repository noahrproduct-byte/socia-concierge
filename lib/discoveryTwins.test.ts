import { describe, expect, it } from "vitest";
import { isYoutubeTwin, sameCreatorName, YOUTUBE_TWIN } from "./discovery";

describe("Instagram twins of YouTube creators", () => {
  it("count only under a matching name", () => {
    expect(sameCreatorName("Liam Ottley", "Liam Ottley | AI Agency")).toBe(true);
    expect(sameCreatorName("liamottley", "Liam Ottley")).toBe(true);
    expect(sameCreatorName("Kube", "Kube")).toBe(true);
    expect(sameCreatorName("Pizza Palace", "Liam Ottley")).toBe(false);
    expect(sameCreatorName(null, "Liam Ottley")).toBe(false);
    expect(sameCreatorName("AI", "AI with Hassan")).toBe(false);
  });
  it("are marked on stored rows", () => {
    expect(isYoutubeTwin({ relevance_reasons: [YOUTUBE_TWIN] })).toBe(true);
    expect(isYoutubeTwin({ relevance_reasons: ["Same niche"] })).toBe(false);
  });
});
