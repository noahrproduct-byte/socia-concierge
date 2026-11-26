import { describe, expect, it } from "vitest";
import { TT_SCOPES, ttScopes } from "./tiktokAuth";

describe("TikTok scopes", () => {
  it("asks for direct posting only when the switch is on", () => {
    expect(ttScopes({})).toEqual(TT_SCOPES);
    expect(ttScopes({ TIKTOK_DIRECT_POST: "0" })).not.toContain("video.publish");
    expect(ttScopes({ TIKTOK_DIRECT_POST: " 1 " })).toEqual([...TT_SCOPES, "video.publish"]);
    expect(TT_SCOPES).toContain("video.upload");
  });
});
