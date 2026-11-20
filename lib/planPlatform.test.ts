import { describe, it, expect } from "vitest";
import { primaryPlatform, shortVideoName } from "./planPlatform";

describe("primaryPlatform", () => {
  it("follows what the person chose, in their order", () => {
    expect(primaryPlatform(["YouTube"], { instagramConnected: false })).toBe("YouTube");
    expect(primaryPlatform(["tiktok", "Instagram"], { instagramConnected: true })).toBe("TikTok");
  });
  it("is Instagram only when chosen, or connected with nothing else known", () => {
    expect(primaryPlatform(null, { instagramConnected: true })).toBe("Instagram");
    expect(primaryPlatform([], { instagramConnected: false, connected: ["youtube"] })).toBe("YouTube");
    expect(primaryPlatform(["Myspace"], { instagramConnected: false })).toBe("Instagram");
  });
  it("names short videos the way each platform does", () => {
    expect(shortVideoName("YouTube")).toBe("Short");
    expect(shortVideoName("Instagram")).toBe("Reel");
  });
});
