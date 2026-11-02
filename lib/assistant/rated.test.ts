import { describe, expect, it } from "vitest";
import { rememberRated, ratedVideos, scopeRated } from "./rated";

const v = { name: "pour.mp4", kind: "video" as const, durationSec: 12, summary: "A pour.", caption: "" };

describe("rated videos belong to one Brand Workspace", () => {
  it("keeps the list in the same workspace and empties it on a switch", () => {
    scopeRated("salvos");
    rememberRated(new File(["a"], "pour.mp4"), v);
    scopeRated("salvos");
    expect(ratedVideos()).toHaveLength(1);
    scopeRated("socia");
    expect(ratedVideos()).toEqual([]);
  });
});
